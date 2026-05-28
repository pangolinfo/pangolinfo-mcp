/**
 * Pangolinfo MCP - tool: filter_niches
 *
 * Wraps POST /api/v1/amzscope/niches/filter on scrape_base.
 *
 * Per backend "Niche Filter API" doc:
 *  - Required: marketplaceId
 *  - Pass `nicheId` to fetch the deep report for a single niche
 *    (there is no separate detail endpoint).
 *  - Pass `nicheTitle` to keyword-match niche titles.
 *  - Pagination size is capped at 10 by the backend.
 *
 * The metric-filter surface is huge (50+ Min/Max pairs); we expose
 * the highest-value handful explicitly and accept the long tail via
 * `extraFilters` so the AI can pass any documented upstream field
 * without us redeploying.
 *
 * NOTE: previous version sent `categoryId`+`site` and omitted the
 * required `marketplaceId`. That request shape did not match the
 * upstream contract — fixed here.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  marketplaceId: z
    .string()
    .min(1)
    .default("US")
    .describe(
      t({
        zh: "Amazon 站点 ID（必填）。常见值：US、UK、DE、JP、FR、IT、ES、CA。默认 US。",
        en: "Amazon marketplace id (required). Common: US, UK, DE, JP, FR, IT, ES, CA. Defaults to US.",
      }),
    ),

  nicheId: z
    .string()
    .optional()
    .describe(
      t({
        zh: "传入单个利基 ID 时返回该利基的全维度深度报告（替代“详情接口”）；不传则按筛选条件返回多个利基。Example: '8140a265-768d-4679-8bc2-994cb1c96f0b'（UUID 格式）。",
        en: "When set, returns the full deep report for that single niche (this endpoint doubles as the niche-detail endpoint). Omit to list multiple niches matching the filters. Example: '8140a265-768d-4679-8bc2-994cb1c96f0b' (UUID).",
      }),
    ),
  nicheTitle: z
    .string()
    .optional()
    .describe(
      t({
        zh: "按关键词匹配利基标题。Examples: 'iphone 16 wallet case' / 'wireless earbuds for sports'。",
        en: "Keyword match against niche titles. Examples: 'iphone 16 wallet case' / 'wireless earbuds for sports'.",
      }),
    ),

  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(t({ zh: "页码，从 1 开始。", en: "Page number, 1-based." })),
  size: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(10)
    .describe(
      t({
        zh: "每页条数，上限 10（服务端硬限制）。",
        en: "Page size, max 10 (backend hard limit).",
      }),
    ),
  sortField: z
    .string()
    .optional()
    .describe(
      t({
        zh: "排序字段，支持任意响应字段名（如 'searchVolumeT90'、'avgProductPrice'）。",
        en: "Sort field; any response field name is accepted (e.g. 'searchVolumeT90', 'avgProductPrice').",
      }),
    ),
  sortOrder: z
    .enum(["asc", "desc"])
    .optional()
    .describe(
      t({
        zh: "排序顺序：'asc' 升序，'desc' 降序。",
        en: "Sort order: 'asc' or 'desc'.",
      }),
    ),

  // ---- Most useful numeric range filters (Min/Max pairs) ----
  searchVolumeT90Min: z.number().int().min(0).optional()
    .describe(t({ zh: "近 90 天搜索量下限。", en: "Min search volume over last 90 days." })),
  searchVolumeT90Max: z.number().int().min(0).optional()
    .describe(t({ zh: "近 90 天搜索量上限。", en: "Max search volume over last 90 days." })),
  searchVolumeT360Min: z.number().int().min(0).optional()
    .describe(t({ zh: "近 360 天搜索量下限。", en: "Min search volume over last 360 days." })),
  searchVolumeT360Max: z.number().int().min(0).optional()
    .describe(t({ zh: "近 360 天搜索量上限。", en: "Max search volume over last 360 days." })),
  searchVolumeGrowthT90Min: z.number().optional()
    .describe(t({ zh: "近 90 天搜索量增长率下限（小数，0.1 = +10%）。", en: "Min 90-day search-volume growth rate (decimal, 0.1 = +10%)." })),
  searchVolumeGrowthT90Max: z.number().optional()
    .describe(t({ zh: "近 90 天搜索量增长率上限。", en: "Max 90-day search-volume growth rate." })),
  minimumPriceMin: z.number().min(0).optional()
    .describe(t({ zh: "利基内最低商品价格的下限。", en: "Lower bound on the niche's minimum product price." })),
  maximumPriceMax: z.number().min(0).optional()
    .describe(t({ zh: "利基内最高商品价格的上限。", en: "Upper bound on the niche's maximum product price." })),
  productCountMin: z.number().int().min(0).optional()
    .describe(t({ zh: "利基内商品数下限。", en: "Min product count in the niche." })),
  productCountMax: z.number().int().min(0).optional()
    .describe(t({ zh: "利基内商品数上限。", en: "Max product count in the niche." })),
  avgReviewCountMin: z.number().int().min(0).optional()
    .describe(t({ zh: "平均评论数下限。", en: "Min average review count." })),
  avgReviewCountMax: z.number().int().min(0).optional()
    .describe(t({ zh: "平均评论数上限——评论数越低意味着竞争越弱。", en: "Max average review count — lower means less competition." })),
  avgReviewRatingMin: z.number().min(0).max(5).optional()
    .describe(t({ zh: "平均评分下限（0-5）。", en: "Min average review rating (0-5)." })),
  top5ProductsClickShareT360Max: z.number().min(0).max(1).optional()
    .describe(t({ zh: "近 360 天前 5 商品点击份额上限（0-1）。值越低代表利基越分散、机会越大。", en: "Max top-5-products click share over 360 days (0-1). Lower = more fragmented niche, more opportunity." })),
  returnRateT360Max: z.number().min(0).max(1).optional()
    .describe(t({ zh: "近 360 天退货率上限（0-1）。", en: "Max return rate over 360 days (0-1)." })),

  // ---- Escape hatch for the long tail of upstream filters ----
  extraFilters: z
    .record(z.unknown())
    .optional()
    .describe(
      t({
        zh: "透传任意上游字段（如 sponsoredProductsPercentageT360Min、successfulLaunchesT360Max、avgBestSellerRankMax 等）。键名按 Pangolinfo 文档原样填写。",
        en: "Pass-through for any other upstream filter (e.g. sponsoredProductsPercentageT360Min, successfulLaunchesT360Max, avgBestSellerRankMax). Keys must match the upstream doc verbatim.",
      }),
    ),
});

export const filterNiches: Tool<typeof inputSchema> = {
  name: "filter_niches",
  description: t({
    zh: `[Amazon 利基筛选] 按 50+ 维指标筛选 Amazon Niche（比类目更细的"消费需求簇"），或当作"niche 详情"接口取单个 niche 完整深度报告。
Use when: 用户说"找蓝海""高搜索量低竞争的利基""增长快的小众市场""niche 选品""为这个 niche 出详细报告""退货率低的利基""退货率 < 10% 的市场"；GTM 选品 SOP 的核心筛选步骤；要某个 niche 的费用结构 / 品牌年龄 / 新品上架趋势等深度指标。
Don't use: 想筛整类目（用 filter_categories）；想看 niche 下的具体商品（用 list_category_products 配合 categoryId，niche 自带的样品 ASIN 只有 1 个 referenceAsin）；只想要广义关键词搜索（用 search_amazon）。
Returns: data.items.data[{ nicheId, nicheTitle, referenceAsinImageUrl, currency, searchVolumeT90, searchVolumeT360, searchVolumeGrowthT90, minimumPrice, maximumPrice, avgPrice, productCount, sponsoredProductsPercentage, primeProductsPercentage, top5ProductsClickShare, top20BrandsClickShare, brandCount, sellingPartnerCount, avgBrandAge, avgBestSellerRank, avgProductPrice, avgReviewCount, avgReviewRating, avgDetailPageQuality, newProductsLaunchedT180/T360, successfulLaunchesT90/T180/T360, returnRateT360, 各项费用 T365 ... 100+ 字段 }] + data.items.pagination.{ total, page, size, hasNext }。**翻页**: 用 page 参数（默认 1，从 1 开始，size 上限 10）；pagination.hasNext=true 表示还有下一页，hasNext=false 表示已到底。
Pair with: ↑ 必填 marketplaceId（默认 US）；nicheTitle 关键词过滤，nicheId 单 niche 详情；↓ 拿到 referenceAsin 后喂 get_amazon_product 看代表品；niche 不直接关联 categoryId，需要二次推断。
Cost: ~1 积点/次, ~5s。
Tips: size 上限 10；50+ 长尾筛选字段走 extraFilters 透传；典型蓝海过滤组合 = searchVolumeT90Min 高 + top5ProductsClickShareT360Max 低 + productCountMax 中 + searchVolumeGrowthT90Min > 0 + returnRateT360Max ≤ 0.10（低退货）。退货率筛选用 returnRateT360Max（上限，0-1 小数），返回里 returnRateT360 字段直接给出具体退货率。`,
    en: `[Amazon niche filter] Filter Amazon Niches (a finer-grained "demand cluster" than categories) by 50+ commercial metrics, or use as a "niche detail" endpoint for one niche.
Use when: user says "find blue ocean" / "high search volume + low competition niches" / "fast-growing small markets" / "niche scouting" / "give me the deep report on this niche" / "low return-rate niches" / "niches with return rate under 10%"; the core filter step of GTM scouting SOPs; getting fee structure / brand age / new-launch trends for one niche.
Don't use: for full categories (use filter_categories); for actual products in a niche (the niche record only carries 1 referenceAsin; combine with categoryId + list_category_products); for plain keyword search (use search_amazon).
Returns: data.items.data[{ nicheId, nicheTitle, referenceAsinImageUrl, currency, searchVolumeT90, searchVolumeT360, searchVolumeGrowthT90, minimumPrice, maximumPrice, avgPrice, productCount, sponsoredProductsPercentage, primeProductsPercentage, top5ProductsClickShare, top20BrandsClickShare, brandCount, sellingPartnerCount, avgBrandAge, avgBestSellerRank, avgProductPrice, avgReviewCount, avgReviewRating, avgDetailPageQuality, newProductsLaunchedT180/T360, successfulLaunchesT90/T180/T360, returnRateT360, fee fields T365 … 100+ fields }] + data.items.pagination.{ total, page, size, hasNext }. **Pagination**: use the 'page' param (default 1, 1-based, size capped at 10); 'pagination.hasNext=true' means more pages exist, 'hasNext=false' means last page.
Pair with: ↑ marketplaceId required (defaults US); nicheTitle for keyword filter, nicheId for single-niche detail; ↓ feed referenceAsin into get_amazon_product to see the representative product; niche doesn't carry a categoryId directly — derive separately if needed.
Cost: ~1 point/call, ~5s.
Tips: size capped at 10; pass long-tail filters (50+ fields) via extraFilters; classic blue-ocean combo = high searchVolumeT90Min + low top5ProductsClickShareT360Max + moderate productCountMax + positive searchVolumeGrowthT90Min + returnRateT360Max ≤ 0.10 (low-return). For return-rate filtering use returnRateT360Max (upper bound, 0-1 decimal); the response includes returnRateT360 with the actual return rate.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const { extraFilters, ...rest } = input;
    const body = { ...rest, ...(extraFilters ?? {}) };
    ctx.logger.info(
      `filter_niches: marketplaceId=${input.marketplaceId} nicheId=${input.nicheId ?? "(none)"} nicheTitle=${input.nicheTitle ?? "(none)"} page=${input.page} size=${input.size}`,
    );
    return ctx.client.post("/api/v1/amzscope/niches/filter", body);
  },
};
