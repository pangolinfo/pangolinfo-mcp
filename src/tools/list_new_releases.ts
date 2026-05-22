/**
 * Pangolinfo MCP - tool: list_new_releases
 *
 * Wraps POST /api/v1/scrape with parserName=amzNewReleases.
 *
 * Verified 2026-05-19: `site` + `content=<category-slug>` returns
 * `data.json[0].data.recsList` (string-encoded JSON array of ASIN
 * objects with rank metadata) + `reftag=zg_bsnr_g_<slug>`. pointCost=1.0
 *
 * Same payload shape as list_bestsellers; this is the New Releases
 * variant of the same ranking widget.
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
        zh: "Amazon New Releases 类目 slug（小写英文短横线），如 'electronics'、'home-garden'。可以从 amazon.com/gp/new-releases 顶部导航的 URL 路径里读到。",
        en: "Amazon New Releases category slug (lowercase, hyphenated). Examples: 'electronics', 'home-garden'. Find these in the URL path on amazon.com/gp/new-releases.",
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
        zh: "返回格式。默认 'json'——结构化新品榜单。需要原始页面阅读时切 'markdown'。",
        en: "Response format. Defaults to 'json' — structured ranking list. Use 'markdown' for the rendered page text.",
      }),
    ),
});

export const listNewReleases: Tool<typeof inputSchema> = {
  name: "list_new_releases",
  description: t({
    zh: `[Amazon 新品榜] 拉某类目的 New Releases——上市 30 天内卖得最好的 ASIN。
Use when: 用户说"X 类目新品""有没有黑马新品""最近上架卖得好的""趋势新品方向""新进竞品"；GTM 选品里捕捉新切入角度；竞品雷达里发现新进入者。
Don't use: 看长青款（用 list_bestsellers）；看类目全部商品（用 list_category_products）；只知道关键词不知道类目（先 search_categories）。
Returns: data.json[0].data.{ reftag='zg_bsnr_g_<slug>', recsList } — recsList 是字符串形式的 JSON 数组，需二次 parse；每条 { id, metadataMap.{ render.zg.rank, ... } }。
Pair with: ↑ categorySlug 同 list_bestsellers；↓ 把 id (ASIN) 喂 get_amazon_product 看为什么能上新品榜（卖点、价格、变体策略）。
Cost: ~1 积点/次, ~5s。`,
    en: `[Amazon New Releases] Best-selling ASINs that hit the market within the last 30 days for a category.
Use when: user says "new arrivals in X" / "any breakout new products" / "newly-launched that sell well" / "trending new directions" / "new entrants to monitor"; GTM scouting for new angles; competitor radar catching new entrants.
Don't use: for evergreen winners (use list_bestsellers); for full category listings (use list_category_products); when you only have a keyword (use search_categories first).
Returns: data.json[0].data.{ reftag='zg_bsnr_g_<slug>', recsList } — recsList is a JSON-string array (parse twice); each row { id, metadataMap.{ render.zg.rank, ... } }.
Pair with: ↑ categorySlug as in list_bestsellers; ↓ feed id (ASIN) into get_amazon_product to see why it climbed (pitch, pricing, variant strategy).
Cost: ~1 point/call, ~5s.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(
      `list_new_releases: slug=${input.categorySlug} site=${input.site} format=${input.format}`,
    );
    return ctx.client.post("/api/v1/scrape", {
      site: input.site,
      content: input.categorySlug,
      parserName: "amzNewReleases",
      format: input.format,
      timeout: 60000,
      ...(input.zipcode ? { bizContext: { zipcode: input.zipcode } } : {}),
    });
  },
};
