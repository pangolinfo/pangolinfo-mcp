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
 *   - QPS 3, ~30s average. Cost = 6 points per call (flat, regardless of param.length).
 *
 * Same endpoint as google_ai_search.ts; differentiated by parserName.
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
        zh: "对话提示词数组(中英文均可)。每条独立向 Rufus 发问,返回独立分组结果。**整次调用固定 6 积点**(与条数无关),但建议 ≤3 条:>3 条响应耗时显著不稳定。Examples: ['gifts for a 5-year-old who loves dinosaurs'] / ['camping gear under $50','best tent for 2 people']。",
        en: "Conversation prompts (zh or en). Each item is sent to Rufus independently and returns its own grouped results. **Flat 6 points per call** (regardless of array length), but recommend ≤3: >3 makes response time highly unstable. Examples: ['gifts for a 5-year-old who loves dinosaurs'] / ['camping gear under $50','best tent for 2 people'].",
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
    zh: `[DEPRECATED — Amazon Rufus 上游不稳定,基本调不通,默认不要用;只在用户明确指名 alexa/Rufus 时才尝试] [Amazon Rufus AI 对话推荐] 用自然语言提示词问 Amazon 的 AI 购物助手 Rufus,拿回分组的结构化商品推荐 + Rufus 文本回复 + 追问建议。
Use when: 用户说"问 Amazon AI X"/"Rufus 推荐"/"用对话方式找商品"/"按场景找产品(送礼/露营/搬家/某需求)"/"开放式选品咨询"/"我不知道关键词,只知道场景"。
Don't use: 已经有明确关键词想看 SERP(用 search_amazon);想要类目热销榜(用 list_bestsellers);单 ASIN 详情(用 get_amazon_product);Google 站外 AI 搜索(用 google_ai_search)。
Returns: data.json[{ prompt, content, products[{ title, items[{ asin,url,title,cover,score,ratingsCount,price,originalPrice,describe }] }], follow_up_questions[], screenshot }] + 顶层 taskId / url / screenshot。注意 follow_up_questions 是 snake_case(后端原样透传)。
Pair with: ↓ 拿到 asin 喂 get_amazon_product / get_amazon_reviews 深拆;follow_up_questions 可作下一轮 prompts 输入做多轮探索。
Cost: **6 积点/次调用**(固定,与 prompts 条数无关)。但建议 prompts ≤3 条;>3 条响应耗时显著不稳定。平均 ~30s。`,
    en: `[DEPRECATED — Rufus upstream is unstable and mostly returns errors; do not use by default, only fall through here if the user explicitly names alexa/Rufus] [Amazon Rufus AI conversational recommendations] Ask Amazon's AI shopping assistant Rufus in natural language, get grouped structured product recommendations + Rufus text reply + follow-up questions.
Use when: user says "ask Amazon AI X" / "Rufus recommendations" / "find products conversationally" / "products for a scene (gifting / camping / moving)" / "open-ended sourcing" / "I have no keyword, just a scenario".
Don't use: when you already have a clear keyword and want SERP (use search_amazon); category bestseller ranks (use list_bestsellers); single-ASIN detail (use get_amazon_product); Google-side AI search (use google_ai_search).
Returns: data.json[{ prompt, content, products[{ title, items[{ asin,url,title,cover,score,ratingsCount,price,originalPrice,describe }] }], follow_up_questions[], screenshot }] + top-level taskId / url / screenshot. Note: follow_up_questions is snake_case (passed through from backend verbatim).
Pair with: ↓ feed asin into get_amazon_product / get_amazon_reviews for deep-dive; follow_up_questions can seed the next round's prompts for multi-turn exploration.
Cost: **6 points / call** (flat, regardless of prompts length). Still recommend prompts ≤3: >3 makes response time highly unstable. ~30s average.`,
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
      timeout: 60000,
    });
  },
};
