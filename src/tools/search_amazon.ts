/**
 * Pangolinfo MCP - tool: search_amazon
 *
 * Per CONTRACT.md §2 / §8 — Amazon keyword search via POST /api/v1/scrape.
 *
 * Backend dispatch (verified 2026-05-19 against scrapeapi prod):
 *   - `format=json` + `parserName=amzKeyword` → structured payload:
 *       data.json[0].data.results[] each with
 *       { asin, title, price, star, rating, sales, badge, rank,
 *         image, delivery, sponsored, ... } + pageIndex/nextPage/keyword.
 *       pointCost=1.0
 *   - `format=markdown` / `rawHtml` → search results page emitted as
 *       markdown/raw bytes without parsing. pointCost=0.75
 *
 *   We default to `json` so the AI gets structured rows it can compare
 *   and filter directly. Markdown remains available for raw reading.
 *
 *   Historical note: the dedicated `/api/v1/search` endpoint has a P0
 *   bug (ValidationContext lacks apiName → ErrorCode 1010). We bypass
 *   it by routing through /scrape with a constructed /s?k=… URL. See
 *   crawler-ext-service/docs/Scrape API接手梳理-业务链路-问题清单.md §7.1#1
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  keyword: z
    .string()
    .min(1)
    .describe(
      t({
        zh: "搜索关键词。Examples: '蓝牙耳机' / 'wireless earbuds' / 'stanley quencher' / 'iphone 16 case'。",
        en: "Search keyword. Examples: 'wireless earbuds' / 'stanley quencher' / 'iphone 16 case' / 'kitchen knife set'.",
      }),
    ),
  site: z
    .enum(["amz_us", "amz_uk", "amz_de", "amz_jp"])
    .default("amz_us")
    .describe(
      t({
        zh: "Amazon 站点。默认 amz_us（美国站）。",
        en: "Amazon marketplace. Defaults to 'amz_us' (US).",
      }),
    ),
  zipcode: z
    .string()
    .optional()
    .describe(
      t({
        zh: "邮编，用于按地区获取价格和库存（如 '10001' 表示纽约）。可选；未填时后端会按站点取默认值。",
        en: "ZIP code for region-specific pricing/inventory (e.g. '10001' for NY). Optional — backend falls back to a per-site default if omitted.",
      }),
    ),
  format: z
    .enum(["json", "markdown"])
    .default("json")
    .describe(
      t({
        zh: "返回格式。默认 'json'——结构化搜索结果（每条含 asin/title/price/star/rating/sales/badge/rank 等），适合程序处理。需要原始页面阅读时切 'markdown'。",
        en: "Response format. Defaults to 'json' — structured search rows (asin, title, price, star, rating, sales, badge, rank, ...) ready for programmatic use. Use 'markdown' if you want the rendered SERP text instead.",
      }),
    ),
});

const SITE_TO_DOMAIN: Record<string, string> = {
  amz_us: "www.amazon.com",
  amz_uk: "www.amazon.co.uk",
  amz_de: "www.amazon.de",
  amz_jp: "www.amazon.co.jp",
};

export const searchAmazon: Tool<typeof inputSchema> = {
  name: "search_amazon",
  description: t({
    zh: `[Amazon SERP 抓取] 用关键词在 Amazon 上跑一次真实搜索，拿回搜索结果首屏 ASIN 列表。
Use when: 用户说"在 Amazon 上搜 X""谁在卖 X""X 关键词下排名前几""做 X 的竞品有哪些"；或要拿到某个关键词的搜索结果页 ASIN 列表作为下游分析输入。
Don't use: 想拿单个 ASIN 的详情（用 get_amazon_product）；想要类目热销榜（用 list_bestsellers）；想看 Google/外部对该词的需求（用 google_ai_search 或 google_trends）。
Returns (format='json', 默认): data.json[0].data.{ pageIndex, nextPage, keyword, results[{ asin, title, price, star, rating, sales, badge, rank, sponsored, image, delivery }] } — 约 20+ 行/页。
Pair with: ↓ 把 results[].asin 喂给 get_amazon_product / get_amazon_reviews 做单品深拆；↓ 同一 keyword 喂给 google_trends 做"内部搜索热度 vs 外部 Google 热度"对比。
Cost: ~1 积点/次, ~5s。`,
    en: `[Amazon SERP scrape] Run a real Amazon keyword search and return the first-page ASIN list.
Use when: user says "search Amazon for X" / "who sells X" / "top results for keyword X" / "competitors for X"; or you need a list of ASINs for a keyword as upstream input to deeper analysis.
Don't use: for a single ASIN detail (use get_amazon_product); for category bestseller ranks (use list_bestsellers); for Google/external demand on the term (use google_ai_search or google_trends).
Returns (format='json', default): data.json[0].data.{ pageIndex, nextPage, keyword, results[{ asin, title, price, star, rating, sales, badge, rank, sponsored, image, delivery }] } — ~20+ rows/page.
Pair with: ↓ feed results[].asin into get_amazon_product / get_amazon_reviews for single-product deep-dive; ↓ feed the same keyword into google_trends to compare in-site vs external demand.
Cost: ~1 point/call, ~5s.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const domain = SITE_TO_DOMAIN[input.site];
    const url = `https://${domain}/s?k=${encodeURIComponent(input.keyword)}`;
    ctx.logger.info(
      `search_amazon: keyword="${input.keyword}" site=${input.site} format=${input.format} url=${url}`,
    );
    // `parserName` is only honored when format=json; harmless for markdown.
    return ctx.client.post("/api/v1/scrape", {
      url,
      parserName: "amzKeyword",
      format: input.format,
      timeout: 60000,
      ...(input.zipcode ? { bizContext: { zipcode: input.zipcode } } : {}),
    });
  },
};
