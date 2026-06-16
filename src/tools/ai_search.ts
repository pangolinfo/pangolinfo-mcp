/**
 * Pangolinfo MCP - tool: ai_search
 *
 * Wraps POST /api/v2/scrape — Google AI Overview / AI Mode scraping.
 *
 * Verified 2026-05-19 against scrapeapi prod:
 *   - mode='overview' (parserName=googleSearch): standard Google SERP
 *     with AI Overview block at the top — returns
 *     `data.json.items[]` containing `ai_overview` (content + references)
 *     + `organic` + `related_searches`. Synchronous, ~30s, 2 points/call.
 *   - mode='ai_mode' (parserName=googleAISearch): Google AI Mode
 *     immersive search (udm=50 URL), supports multi-turn `param`
 *     follow-ups. Same response shape. ~30s, 2 points/call.
 *
 * Both modes are synchronous.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      t({
        zh: "搜索关键词或问题。Examples: 'wireless earbuds reviews' (单点查询) / 'how does noise cancellation work' (问句) / 'what do people complain about Stanley Quencher' (用户痛点)。",
        en: "Search keyword or question. Examples: 'wireless earbuds reviews' (single keyword) / 'how does noise cancellation work' (question) / 'what do people complain about Stanley Quencher' (user pain point).",
      }),
    ),
  mode: z
    .enum(["overview", "ai_mode"])
    .default("overview")
    .describe(
      t({
        zh: "搜索模式：'overview'（默认）= 标准 Google SERP + 顶部 AI Overview 摘要，适合一次性查询；'ai_mode' = Google AI Mode 沉浸式搜索（udm=50），适合复杂问题拆解和多轮追问。",
        en: "Search mode: 'overview' (default) = standard Google SERP with AI Overview at the top, best for one-shot queries; 'ai_mode' = Google AI Mode immersive search (udm=50), best for complex multi-step questions with follow-ups.",
      }),
    ),
  followups: z
    .array(z.string())
    .max(5)
    .optional()
    .describe(
      t({
        zh: "多轮追问列表（仅 mode='ai_mode' 时生效）。每条是基于前一轮答案的追问。**超过 5 条响应效率显著下降**。",
        en: "Follow-up question list (only honored when mode='ai_mode'). Each item is a follow-up question on the previous answer. **More than 5 entries significantly degrades response time.**",
      }),
    ),
  screenshot: z
    .boolean()
    .default(false)
    .describe(
      t({
        zh: "是否返回搜索页截图 URL。默认 false。",
        en: "Whether to return a screenshot URL of the rendered search page. Defaults to false.",
      }),
    ),
});

export const aiSearch: Tool<typeof inputSchema> = {
  name: "ai_search",
  description: t({
    zh: `[AI Search via Google SERP] 抓取 Google 公开搜索结果(数据来源:Google,使用须遵守 Google 服务条款)，含顶部 AI Overview 摘要、organic 自然位、相关搜索词。两种模式：overview（标准 SERP）/ ai_mode（沉浸式对话，支持多轮追问）。
Use when: 用户说"Google 搜一下""外部需求""市场上人们怎么说 X""Reddit/Quora 上的痛点""AI 搜索时代我的内容能被引用吗""为某关键词找用户原声"；选品 SOP 里的"消费者原声"步骤；判断新品概念在 Amazon 站外是否有真实需求。
Don't use: 想在 Amazon 站内搜（用 search_amazon）；只要趋势曲线（用 keyword_trends，更便宜更聚焦）。
Returns: data.{ results_num, ai_overview, json.items[ { type:'ai_overview', items:[{content:[...], references:[{title,url,domain}]}] }, { type:'organic', items:[{title,url,text}] }, { type:'related_searches', items:[...] } ], screenshot, taskId }。
Pair with: ↑ query 由用户提问推导；mode='ai_mode' 时传 followups[1..5] 做多轮追问；↓ ai_overview.references[].url 可作外部权威源，organic 结果可喂下游做内容竞争分析。
Cost: ~2 积点/次, ~30s（**慢**——这是 Google AI 渲染时间）。
Tips: 单次查询用 overview 更经济；只有要"拆解复杂问题 + 连续追问"时才上 ai_mode。followups 超 5 条响应明显变慢。`,
    en: `[AI Search via Google SERP] Scrape publicly-available Google search results (data source: Google; use must comply with Google Terms of Service) with top AI Overview, organic results, and related searches. Two modes: overview (standard SERP) / ai_mode (immersive multi-turn conversational search).
Use when: user says "Google for me" / "external demand" / "what do people say about X" / "Reddit/Quora pain points" / "will my content be cited in AI search" / "find user complaints for keyword X"; "consumer voice" step in scouting SOPs; verifying whether a new product concept has off-Amazon demand.
Don't use: for on-Amazon search (use search_amazon); when only the trend curve matters (use keyword_trends — cheaper and tighter).
Returns: data.{ results_num, ai_overview, json.items[ { type:'ai_overview', items:[{content:[...], references:[{title,url,domain}]}] }, { type:'organic', items:[{title,url,text}] }, { type:'related_searches', items:[...] } ], screenshot, taskId }.
Pair with: ↑ query inferred from user; in 'ai_mode' pass followups[1..5] for multi-turn; ↓ ai_overview.references[].url for authoritative external sources, organic items for content-competition analysis.
Cost: ~2 points/call, ~30s (**slow** — Google AI render time).
Tips: prefer overview for single queries (cheaper); use ai_mode only when you need decomposed multi-turn investigation. Followups > 5 visibly slow down responses.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const encoded = encodeURIComponent(input.query);
    const url =
      input.mode === "ai_mode"
        ? `https://www.google.com/search?num=10&udm=50&q=${encoded}`
        : `https://www.google.com/search?q=${encoded}`;
    const parserName =
      input.mode === "ai_mode" ? "googleAISearch" : "googleSearch";

    ctx.logger.info(
      `ai_search: mode=${input.mode} query="${input.query}" followups=${input.followups?.length ?? 0}`,
    );

    const body: Record<string, unknown> = {
      url,
      parserName,
      screenshot: input.screenshot,
      // Google AI rendering is slow: overview ~5s, but ai_mode commonly
      // runs 60s+ (measured ~61s end-to-end). The scrape backend defaults
      // to a 60s per-task timeout and will cut the request off mid-render
      // (observed as an HTTP/2 INTERNAL_ERROR / "connector unavailable"
      // on the client). Pass an explicit, generous timeout the same way
      // search_amazon_alexa does, so long ai_mode renders aren't killed at
      // the 60s default. 180s covers ai_mode + follow-ups with headroom.
      timeout: 180000,
    };
    if (input.mode === "ai_mode" && input.followups?.length) {
      body.param = input.followups;
    } else if (input.mode === "ai_mode") {
      // AI Mode requires `param` per the upstream doc; pass an empty
      // string array as the initial-question placeholder when no
      // follow-ups are provided.
      body.param = [""];
    }

    return ctx.client.post("/api/v2/scrape", body);
  },
};
