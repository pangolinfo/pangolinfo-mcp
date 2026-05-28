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
    .enum(["amz_us", "amz_uk", "amz_de", "amz_jp", "amz_fr", "amz_it", "amz_es", "amz_ca", "amz_au", "amz_sa", "amz_ae", "amz_br", "amz_mx"])
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
        zh: "邮编，必须匹配 site 站点所在国家（amz_us → 美国邮编，amz_jp → 日本邮编 …）。可选；不传时后端会从对应国家邮编池随机挑一个。跨国邮编（如 amz_us + 日本邮编）会被后端拒绝。Examples: 10001 (NY) / 90001 (LA) / 100-0001 (Tokyo).",
        en: "ZIP code that must match the site country (amz_us → US zip, amz_jp → JP zip, ...). Optional; backend picks a random one from the per-country pool when omitted. Cross-country zips (e.g. amz_us + JP zip) are rejected by the backend. Examples: 10001 (NY) / 90001 (LA) / 100-0001 (Tokyo).",
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
  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      t({
        zh: "页码，从 1 开始。每页约 22 条 ASIN。结合响应里的 pageIndex/nextPage 决定是否继续翻：nextPage 为下一页页码，nextPage=null（或缺失）表示已到最后一页。**只在用户明确要更多/Top-N（N>单页量）/全部时才翻**，否则首页够用。",
        en: "Page number, 1-based. ~22 ASINs per page. Use response's pageIndex/nextPage to decide whether to continue: nextPage holds the next page number; nextPage=null (or absent) means last page reached. **Only paginate when the user explicitly asks for more / Top-N where N exceeds one page / all results** — otherwise the first page is enough.",
      }),
    ),
});

const SITE_TO_DOMAIN: Record<string, string> = {
  amz_us: "www.amazon.com",
  amz_uk: "www.amazon.co.uk",
  amz_de: "www.amazon.de",
  amz_jp: "www.amazon.co.jp",
  amz_fr: "www.amazon.fr",
  amz_it: "www.amazon.it",
  amz_es: "www.amazon.es",
  amz_ca: "www.amazon.ca",
  amz_au: "www.amazon.com.au",
  amz_sa: "www.amazon.sa",
  amz_ae: "www.amazon.ae",
  amz_br: "www.amazon.com.br",
  amz_mx: "www.amazon.com.mx",
};

export const searchAmazon: Tool<typeof inputSchema> = {
  name: "search_amazon",
  description: t({
    zh: `[Amazon SERP 抓取] 用关键词在 Amazon 上跑一次真实搜索，拿回搜索结果首屏 ASIN 列表。
Use when: 用户说"在 Amazon 上搜 X""谁在卖 X""X 关键词下排名前几""做 X 的竞品有哪些"；或要拿到某个关键词的搜索结果页 ASIN 列表作为下游分析输入。
Don't use: 想拿单个 ASIN 的详情（用 get_amazon_product）；想要类目热销榜（用 list_bestsellers）；想看 Google/外部对该词的需求（用 ai_search 或 keyword_trends）。
Returns (format='json', 默认): data.json[0].data.{ pageIndex, nextPage, keyword, results[{ asin, title, price, star, rating, sales, badge, rank, sponsored, image, delivery }] } — 约 22 行/页。**翻页**: 用 page 参数（默认 1，从 1 开始）；响应里 nextPage 给下一页页码，nextPage=null 表示到底。
Pair with: ↓ 把 results[].asin 喂给 get_amazon_product / get_amazon_reviews 做单品深拆；↓ 同一 keyword 喂给 keyword_trends 做"内部搜索热度 vs 外部 Google 热度"对比。
Cost: ~1 积点/页, ~5s。**翻页只在用户明确要"更多/Top-N(N>22)/全部"时才做**，否则首页够用。`,
    en: `[Amazon SERP scrape] Run a real Amazon keyword search and return the first-page ASIN list.
Use when: user says "search Amazon for X" / "who sells X" / "top results for keyword X" / "competitors for X"; or you need a list of ASINs for a keyword as upstream input to deeper analysis.
Don't use: for a single ASIN detail (use get_amazon_product); for category bestseller ranks (use list_bestsellers); for Google/external demand on the term (use ai_search or keyword_trends).
Returns (format='json', default): data.json[0].data.{ pageIndex, nextPage, keyword, results[{ asin, title, price, star, rating, sales, badge, rank, sponsored, image, delivery }] } — ~22 rows/page. **Pagination**: use the 'page' param (default 1, 1-based); response's 'nextPage' holds the next page number, 'nextPage=null' means last page reached.
Pair with: ↓ feed results[].asin into get_amazon_product / get_amazon_reviews for single-product deep-dive; ↓ feed the same keyword into keyword_trends to compare in-site vs external demand.
Cost: ~1 point/page, ~5s. **Only paginate when the user explicitly asks for more / Top-N (N>22) / all results** — otherwise the first page is enough.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const domain = SITE_TO_DOMAIN[input.site];
    const pageSuffix = input.page > 1 ? `&page=${input.page}` : "";
    const url = `https://${domain}/s?k=${encodeURIComponent(input.keyword)}${pageSuffix}`;
    ctx.logger.info(
      `search_amazon: keyword="${input.keyword}" site=${input.site} format=${input.format} page=${input.page} url=${url}`,
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
