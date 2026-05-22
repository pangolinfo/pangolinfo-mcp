/**
 * Pangolinfo MCP - tool: list_bestsellers
 *
 * Wraps POST /api/v1/scrape with parserName=amzBestSellers.
 *
 * Verified 2026-05-19: `site` + `content=<category-slug>` returns
 * `data.json[0].data.recsList` — a string-encoded JSON array of ASIN
 * objects with `{ id, metadataMap.{rank, currentSalesRank, percentageChange, twentyFourHourOldSalesRank} }`,
 * plus `reftag` and `acpParam`. pointCost=1.0
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  categorySlug: z
    .string()
    .min(1)
    .describe(
      t({
        zh: "Amazon Best Sellers 类目 slug（小写英文短横线），如 'electronics'、'home-garden'、'beauty'、'toys-and-games'。可以从 amazon.com/Best-Sellers 顶部导航的 URL 路径里读到。",
        en: "Amazon Best Sellers category slug (lowercase, hyphenated). Examples: 'electronics', 'home-garden', 'beauty', 'toys-and-games'. Find these in the URL path on amazon.com/Best-Sellers.",
      }),
    ),
  site: z
    .enum(["amz_us", "amz_uk", "amz_de", "amz_jp"])
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
        zh: "邮编（如 '10041'）。可选；未填后端按站点取默认值。",
        en: "ZIP code (e.g. '10041'). Optional — backend falls back to a per-site default.",
      }),
    ),
  format: z
    .enum(["json", "markdown"])
    .default("json")
    .describe(
      t({
        zh: "返回格式。默认 'json'——结构化 Top-100 ASIN 排名列表。需要原始页面阅读时切 'markdown'。",
        en: "Response format. Defaults to 'json' — structured Top-100 ranked ASIN list. Use 'markdown' for the rendered page text.",
      }),
    ),
});

export const listBestsellers: Tool<typeof inputSchema> = {
  name: "list_bestsellers",
  description: t({
    zh: `[Amazon 热销榜] 拉某类目的 Best Sellers Top-100，含 24h 排名变化。
Use when: 用户说"X 类目热销榜""哪些是该类目龙头""有没有黑马冲上来""benchmark 卖得最好的产品"；选品时定基准品；竞品雷达里追踪类目龙头排名变化。
Don't use: 看新品（用 list_new_releases）；想要类目下完整商品列表而非 Top 100（用 list_category_products）；只知道关键词不知道类目（用 search_categories 先找类目）。
Returns: data.json[0].data.{ reftag, recsList } — recsList 是字符串形式的 JSON 数组，需要二次 parse；每条 { id, metadataMap.{ render.zg.rank, currentSalesRank, percentageChange, twentyFourHourOldSalesRank } }。
Pair with: ↑ categorySlug 需要用户提供或从场景推测（如 'electronics' / 'home-garden' / 'beauty'）；↓ 把 id (ASIN) 喂 get_amazon_product 拆单品。
Cost: ~1 积点/次, ~5s。
Tips: categorySlug 是 Amazon URL 路径里的英文短横线串，从 amazon.com/Best-Sellers 顶部导航能看到。`,
    en: `[Amazon Best Sellers] Top-100 ranking for a category with 24h rank deltas.
Use when: user says "X category bestsellers" / "who's #1 in X" / "any new entrants climbing" / "benchmark top sellers"; setting baseline products during niche scouting; tracking category leadership in competitor radars.
Don't use: for new arrivals (use list_new_releases); for full category listings beyond top 100 (use list_category_products); when you only have a keyword (use search_categories first).
Returns: data.json[0].data.{ reftag, recsList } — recsList is a JSON-string array (parse twice); each row { id, metadataMap.{ render.zg.rank, currentSalesRank, percentageChange, twentyFourHourOldSalesRank } }.
Pair with: ↑ categorySlug from user or scene inference (e.g. 'electronics' / 'home-garden' / 'beauty'); ↓ feed id (ASIN) into get_amazon_product for single-product deep-dive.
Cost: ~1 point/call, ~5s.
Tips: categorySlug is the hyphenated English slug in amazon.com/Best-Sellers URL paths.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(
      `list_bestsellers: slug=${input.categorySlug} site=${input.site} format=${input.format}`,
    );
    return ctx.client.post("/api/v1/scrape", {
      site: input.site,
      content: input.categorySlug,
      parserName: "amzBestSellers",
      format: input.format,
      timeout: 60000,
      ...(input.zipcode ? { bizContext: { zipcode: input.zipcode } } : {}),
    });
  },
};
