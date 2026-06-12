/**
 * Pangolinfo MCP - tool: search_amazon_alexa
 *
 * Wraps POST /api/v2/scrape (parserName=amazonAlexa) — Amazon Rufus
 * AI shopping assistant conversational recommendations.
 *
 * Backend contract (per docs.pangolinfo.com 2026-05-27):
 *   - param: string[] — up to 5 prompts, each billed at 6 points
 *   - screenshot: boolean — optional, default false
 *   - Response: data.json[{ prompt, content, products[{ title,
 *       items[{asin,url,title,cover,score,ratingsCount,price,
 *       originalPrice,describe}] }], follow_up_questions, screenshot }]
 *   - QPS 3. Cost = 6 points PER PROMPT (param.length × 6) — NOT flat per call.
 *   - Latency scales with prompt count: ~60–90s for 1 prompt, and can
 *     exceed 200s for multiple. Strongly prefer a single prompt per call.
 *
 * Same endpoint as ai_search.ts; differentiated by parserName.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  prompts: z
    .array(z.string().min(1))
    .min(1)
    .max(5)
    .describe(
      t({
        zh: "对话提示词数组(中英文均可)。每条独立向 Rufus 发问,返回独立分组结果。**按条计费:每条 6 积点**(传 N 条 = N×6 积点,不是每次固定 6)。**强烈建议每次只传 1 条**:这是慢接口,单条 60–90s,多条线性累加可能 >200s。最多 5 条,但多条既慢又费积点,多个需求请拆成多次单条调用。Examples: ['gifts for a 5-year-old who loves dinosaurs'] / ['camping gear under $50']。",
        en: "Conversation prompts (zh or en). Each item is sent to Rufus independently and returns its own grouped results. **Billed per prompt: 6 points each** (N prompts = N×6 points, NOT a flat 6 per call). **Strongly prefer exactly 1 prompt per call**: this is a slow tool — 60–90s for one, and multiple add up linearly and can exceed 200s. Max 5, but multiple is both slow and costly; for several needs make several single-prompt calls. Examples: ['gifts for a 5-year-old who loves dinosaurs'] / ['camping gear under $50'].",
      }),
    ),
  screenshot: z
    .boolean()
    .default(false)
    .describe(
      t({
        zh: "是否返回 Rufus 对话页面截图 URL。默认 false。true 会增加后端负担,仅当需要给最终用户附图证据时打开。",
        en: "Return the Rufus conversation screenshot URL. Defaults to false. Setting true adds backend load; only enable when you need an image proof for end users.",
      }),
    ),
});

export const searchAmazonAlexa: Tool<typeof inputSchema> = {
  name: "search_amazon_alexa",
  description: t({
    zh: `[Amazon Rufus AI 对话推荐] 用自然语言提示词问 Amazon 的 AI 购物助手 Rufus,拿回分组的结构化商品推荐 + Rufus 文本回复 + 追问建议。
Use when: 用户说"问 Amazon AI X"/"Rufus 推荐"/"用对话方式找商品"/"按场景找产品(送礼/露营/搬家/某需求)"/"开放式选品咨询"/"我不知道关键词,只知道场景"。
Don't use: 已经有明确关键词想看 SERP(用 search_amazon);想要类目热销榜(用 list_bestsellers);单 ASIN 详情(用 get_amazon_product);Google 站外 AI 搜索(用 ai_search)。
Returns: data.json[{ prompt, content, products[{ title, items[{ asin,url,title,cover,score,ratingsCount,price,originalPrice,describe }] }], follow_up_questions[], screenshot }] + 顶层 taskId / url / screenshot。注意 follow_up_questions 是 snake_case(后端原样透传)。
Pair with: ↓ 拿到 asin 喂 get_amazon_product / get_amazon_reviews 深拆;follow_up_questions 可作下一轮 prompts 输入做多轮探索。
Cost: **每条 prompt 6 积点**(按 prompts 条数计费,不是每次固定 6 积点;传 N 条 = N×6 积点)。
⚠️ **慢接口**:**强烈建议每次只传 1 条 prompt**。单条响应通常 **60–90s**(Rufus 实时对话生成,比普通抓取慢得多);多条会线性累加,**可能超过 200s**,既慢又费积点。调用方请按长耗时处理——设足够长的超时、不要因没秒回就重试或并发重复调用。多个需求请拆成多次单条调用,而不是一次塞多条。`,
    en: `[Amazon Rufus AI conversational recommendations] Ask Amazon's AI shopping assistant Rufus in natural language, get grouped structured product recommendations + Rufus text reply + follow-up questions.
Use when: user says "ask Amazon AI X" / "Rufus recommendations" / "find products conversationally" / "products for a scene (gifting / camping / moving)" / "open-ended sourcing" / "I have no keyword, just a scenario".
Don't use: when you already have a clear keyword and want SERP (use search_amazon); category bestseller ranks (use list_bestsellers); single-ASIN detail (use get_amazon_product); Google-side AI search (use ai_search).
Returns: data.json[{ prompt, content, products[{ title, items[{ asin,url,title,cover,score,ratingsCount,price,originalPrice,describe }] }], follow_up_questions[], screenshot }] + top-level taskId / url / screenshot. Note: follow_up_questions is snake_case (passed through from backend verbatim).
Pair with: ↓ feed asin into get_amazon_product / get_amazon_reviews for deep-dive; follow_up_questions can seed the next round's prompts for multi-turn exploration.
Cost: **6 points PER PROMPT** (billed by prompts count, NOT a flat 6 per call; N prompts = N×6 points).
⚠️ **Slow tool**: **strongly prefer sending exactly 1 prompt per call**. A single prompt typically takes **60–90s** (Rufus generates the conversation live — far slower than a normal scrape); multiple prompts add up linearly and **can exceed 200s**, costing both time and points. Treat this as a long-running call: set a generous timeout, and do NOT retry or fire concurrent duplicate calls just because it didn't return instantly. For several needs, make several single-prompt calls rather than batching them.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(
      `search_amazon_alexa: prompts=${input.prompts.length} screenshot=${input.screenshot}`,
    );
    return ctx.client.post("/api/v2/scrape", {
      parserName: "amazonAlexa",
      param: input.prompts,
      screenshot: input.screenshot,
      // Rufus is slow: ~60-90s for a single prompt, and latency scales
      // with prompt count (can exceed 200s for several). Allow enough
      // headroom for the documented 5-prompt max so the backend doesn't
      // cut off a legitimately slow multi-prompt request.
      timeout: 240000,
    });
  },
};
