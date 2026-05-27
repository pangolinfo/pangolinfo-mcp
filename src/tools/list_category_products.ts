/**
 * Pangolinfo MCP - tool: list_category_products
 *
 * Wraps POST /api/v1/scrape with parserName=amzProductOfCategory.
 *
 * Verified 2026-05-19 (node 172282 = Electronics): returns
 * `data.json[0].data.results[]` — each row with
 * `{ asin, title, price, star, rating, rank, img }` + pagination
 * `{ pageIndex, maxPage, nextPage, categoryName, pagination }`.
 * pointCost=1.0
 *
 * Distinct from `filter_niches`: this returns concrete product rows
 * for browsing a category; filter_niches returns aggregated niche
 * metrics. Pair them when you want to (1) find a niche via metrics
 * then (2) drill into actual products.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  nodeId: z
    .string()
    .regex(/^\d+$/, "Amazon category node id must be numeric")
    .describe(
      t({
        zh: "Amazon 类目 Browse Node ID（纯数字）。Examples: '172282' (Electronics) / '2619526011' (Appliances) / '11965861' (Musical Instruments)。可通过 search_categories / get_category_children 获得。",
        en: "Amazon category Browse Node ID (numeric). Examples: '172282' (Electronics) / '2619526011' (Appliances) / '11965861' (Musical Instruments). Obtain via search_categories or get_category_children.",
      }),
    ),
  site: z
    .enum(["amz_us", "amz_uk", "amz_de", "amz_jp", "amz_fr", "amz_it", "amz_es", "amz_ca", "amz_au", "amz_sa", "amz_ae", "amz_br", "amz_mx"])
    .default("amz_us")
    .describe(
      t({
        zh: "Amazon 站点。默认 amz_us。",
        en: "Amazon marketplace. Defaults to amz_us.",
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
        zh: "返回格式。默认 'json'——结构化类目商品列表。需要原始页面阅读时切 'markdown'。",
        en: "Response format. Defaults to 'json' — structured category listings. Use 'markdown' for the rendered page text.",
      }),
    ),
  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      t({
        zh: "页码，从 1 开始。每页 24 条。结合响应里的 pageIndex/maxPage/nextPage 决定是否继续：nextPage 为下一页页码，nextPage=null 或 page>=maxPage 表示到底。**只在用户明确要更多/全部时才翻**，否则首页够用。",
        en: "Page number, 1-based. 24 rows per page. Use response's pageIndex/maxPage/nextPage to decide whether to continue: nextPage holds the next page number; nextPage=null or page>=maxPage means last page reached. **Only paginate when the user explicitly asks for more / all results** — otherwise the first page is enough.",
      }),
    ),
});

export const listCategoryProducts: Tool<typeof inputSchema> = {
  name: "list_category_products",
  description: t({
    zh: `[Amazon 类目商品列表] 按 Browse Node ID 列出该类目下的具体在售商品（分页，每页 24 条）。
Use when: 用户说"X 类目卖什么""列出类目 12345 下的商品""看这个类目都有些什么"；选品时拿到 categoryId 后看真实在售品；竞品调研时看类目铺货密度。
Don't use: 只想要 Top-100 龙头（用 list_bestsellers，更便宜信号更聚焦）；要类目聚合指标（销量/搜索量/竞品密度等用 filter_categories）；要利基 niche 而非整类目（用 filter_niches）。
Returns: data.json[0].data.{ pageIndex, maxPage, nextPage, categoryName, pagination, results[{ asin, title, price, star, rating, rank, img }] } —— 每页 24 条。**翻页**: 用 page 参数（默认 1，从 1 开始）；nextPage 为下一页页码，nextPage=null 或 page>=maxPage 表示到底。
Pair with: ↑ nodeId 常来自 search_categories（按关键词找类目）或 get_category_children（树状下钻）；↓ asin 喂 get_amazon_product；categoryId 同时也能喂 filter_categories 取聚合指标。
Cost: ~1 积点/页, ~5s。**翻页只在用户明确要"更多/全部"时才做**，否则首页够用。`,
    en: `[Amazon category listing] List concrete on-sale products under a Browse Node ID (paginated, 24 rows/page).
Use when: user says "what's selling in category X" / "list products in node 12345" / "show me what's in this category"; after picking a categoryId during scouting, you want to see real listings; competitor-research on category density.
Don't use: when only the top-100 winners matter (use list_bestsellers — cheaper and more signal); for category-level aggregate metrics (use filter_categories — sales/search volume/competitor density); for niche rather than full category (use filter_niches).
Returns: data.json[0].data.{ pageIndex, maxPage, nextPage, categoryName, pagination, results[{ asin, title, price, star, rating, rank, img }] } — 24 rows/page. **Pagination**: use the 'page' param (default 1, 1-based); 'nextPage' holds the next page number, 'nextPage=null' or 'page>=maxPage' means last page reached.
Pair with: ↑ nodeId from search_categories (keyword→category) or get_category_children (tree drilldown); ↓ asin into get_amazon_product; same categoryId can also feed filter_categories for aggregate metrics.
Cost: ~1 point/page, ~5s. **Only paginate when the user explicitly asks for more / all results** — otherwise the first page is enough.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const content =
      input.page > 1 ? `${input.nodeId}?page=${input.page}` : input.nodeId;
    ctx.logger.info(
      `list_category_products: nodeId=${input.nodeId} site=${input.site} format=${input.format} page=${input.page}`,
    );
    return ctx.client.post("/api/v1/scrape", {
      site: input.site,
      content,
      parserName: "amzProductOfCategory",
      format: input.format,
      timeout: 60000,
      ...(input.zipcode ? { bizContext: { zipcode: input.zipcode } } : {}),
    });
  },
};
