/**
 * Pangolinfo MCP - tool: filter_categories
 *
 * Wraps POST /api/v1/amzscope/categories/filter on scrape_base.
 *
 * Per backend "Category Filter API" doc:
 *  - Required: marketplaceId, timeRange, sampleScope
 *  - There is NO separate "detail" endpoint. Passing a single
 *    `categoryId` returns one row containing every metric for
 *    that category — that is the detail mode.
 *  - Without `categoryId`, the rich metric filters below pick a
 *    short-list of categories matching the constraints.
 *  - Pagination size is capped at 10 by the backend (CommonException
 *    if exceeded).
 *
 * The metric-filter surface is huge. We expose only the most
 * load-bearing ones explicitly; everything else goes through
 * `extraFilters` as an escape hatch so the AI can pass any field
 * documented upstream without us redeploying.
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
        zh: "Amazon 站点 ID。⚠️ 后端目前仅支持 US；传其他站点会失败或回退。默认且只用 US。",
        en: "Amazon marketplace id. ⚠️ Backend currently supports US only; other marketplaces will fail or fall back. Use US (the default).",
      }),
    ),
  timeRange: z
    .string()
    .min(1)
    .describe(
      t({
        zh: "数据聚合时间范围（必填）。Examples: 'l7d'（近 7 天，已验证有效）。具体可选值由后端决定，l7d 是已知能跑通的取值。",
        en: "Aggregation time range (required). Examples: 'l7d' (last 7 days — verified working). The exact enum is backend-defined; 'l7d' is the safest known value.",
      }),
    ),
  sampleScope: z
    .string()
    .min(1)
    .describe(
      t({
        zh: "数据样本范围（必填）。Examples: 'all_asin'（全部 ASIN，已验证有效）。",
        en: "Sample scope (required). Examples: 'all_asin' (all ASINs — verified working).",
      }),
    ),

  categoryId: z
    .string()
    .optional()
    .describe(
      t({
        zh: "传入单个类目 ID 时返回该类目的全维度详情（替代“详情接口”）；不传则按筛选条件返回多个类目。Example: '979832011'。",
        en: "When set, returns the full metric row for that single category (this endpoint doubles as the 'detail' endpoint). Omit to list multiple categories matching the filters. Example: '979832011'.",
      }),
    ),

  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      t({ zh: "页码，从 1 开始。", en: "Page number, 1-based." }),
    ),
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
        zh: "排序字段，支持任意响应字段名（如 'unitSoldSum'、'netShippedGmsSum'）。",
        en: "Sort field; any response field name is accepted (e.g. 'unitSoldSum', 'netShippedGmsSum').",
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
  unitSoldSumMin: z.number().int().min(0).optional()
    .describe(t({ zh: "总销量下限。", en: "Min total units sold." })),
  unitSoldSumMax: z.number().int().min(0).optional()
    .describe(t({ zh: "总销量上限。", en: "Max total units sold." })),
  netShippedGmsSumMin: z.number().int().min(0).optional()
    .describe(t({ zh: "商品销售总额 (GMS) 下限。", en: "Min total GMS (gross merchandise sales)." })),
  netShippedGmsSumMax: z.number().int().min(0).optional()
    .describe(t({ zh: "GMS 上限。", en: "Max total GMS." })),
  searchVolumeSumMin: z.number().int().min(0).optional()
    .describe(t({ zh: "总搜索量下限。", en: "Min total search volume." })),
  searchVolumeSumMax: z.number().int().min(0).optional()
    .describe(t({ zh: "总搜索量上限。", en: "Max total search volume." })),
  buyBoxPriceAvgMin: z.number().min(0).optional()
    .describe(t({ zh: "平均黄金购物车价格下限（按站点本币）。", en: "Min average buy-box price (marketplace currency)." })),
  buyBoxPriceAvgMax: z.number().min(0).optional()
    .describe(t({ zh: "平均黄金购物车价格上限。", en: "Max average buy-box price." })),

  // ---- Categorical bucket filters (most actionable for niche hunting) ----
  buyBoxPriceTiers: z
    .array(z.enum(["budget", "mainstream", "premium", "luxury"]))
    .optional()
    .describe(
      t({
        zh: "价格档位筛选。可选：budget、mainstream、premium、luxury。",
        en: "Price-tier filter. Allowed: budget, mainstream, premium, luxury.",
      }),
    ),
  returnRatioLevels: z
    .array(z.enum(["excellent", "average", "risk"]))
    .optional()
    .describe(
      t({
        zh: "退货率质量等级。可选：excellent、average、risk。",
        en: "Return-rate quality buckets. Allowed: excellent, average, risk.",
      }),
    ),
  searchToPurchaseRatioLevels: z
    .array(z.enum(["to_improve", "average", "excellent"]))
    .optional()
    .describe(
      t({
        zh: "搜索到购买转化率等级。可选：to_improve、average、excellent。",
        en: "Search-to-purchase conversion buckets. Allowed: to_improve, average, excellent.",
      }),
    ),

  // ---- Escape hatch for the long tail of upstream filters ----
  extraFilters: z
    .record(z.unknown())
    .optional()
    .describe(
      t({
        zh: "透传任意上游字段（如 unitSoldTrendDirections、newAsinCountLevels、metricChangeRateBuckets 等）。键名按 Pangolinfo 文档原样填写。",
        en: "Pass-through for any other upstream filter (e.g. unitSoldTrendDirections, newAsinCountLevels, metricChangeRateBuckets). Keys must match the upstream doc verbatim.",
      }),
    ),
});

export const filterCategories: Tool<typeof inputSchema> = {
  name: "filter_categories",
  description: t({
    zh: `[Amazon 类目商业指标筛选] 按销量/GMS/搜索量/转化率/退货率/价格档位/竞品密度等数十维指标筛类目，或当作"类目详情"接口取单个类目全量指标。
Use when: 用户说"找一些值得做的类目""筛销量大的类目""退货率低的类目""高搜索量但竞品少的类目""看看 X 类目（categoryId）的全部指标"；类目层面的蓝海挖掘；要某个类目的 30+ 商业指标快照。
Don't use: 想筛细分 niche 而非整类目（用 filter_niches，颗粒度更细）；想看类目下的具体商品（用 list_category_products）；只想要类目名字（用 get_category_paths）。
Returns: data.items.data[{ id, categoryId, marketplaceId, timeRange, sampleScope, snapshotDate, unitSoldSum, glanceViewsSum, searchVolumeSum, netShippedGmsSum, buyBoxPriceAvg, buyBoxPriceTier, searchToPurchaseRatio, returnRatio, asinCount, offersPerAsin, newAsinCount, newBrandCount, avgAdSpendPerClick, unitSoldTrendDirection, unitSoldChangeRateBucket, ... 趋势 + 分位数桶等数十字段 }] + data.items.pagination.{ total, page, size, hasNext }。**翻页**: 用 page 参数（默认 1，从 1 开始，size 上限 10）；pagination.hasNext=true 表示还有下一页，hasNext=false 表示已到底。
Pair with: ↑ 必填 timeRange (常用 'l7d') + sampleScope ('all_asin') + marketplaceId（默认 US）；categoryId 来自 search_categories / get_category_children；↓ 出来的高潜类目喂 list_category_products / list_bestsellers 看真实商品。
Cost: ~1 积点/页, ~5s。
Tips: size 上限 10（后端硬限制）；翻页只在用户明确要"看更多候选类目"时才做，单次详情/快速筛选首页够用；长尾筛选字段（unitSoldTrendDirections / metricChangeRateBuckets 等数十个）走 extraFilters 透传。`,
    en: `[Amazon category commercial-metrics filter] Filter categories by dozens of metrics (sales, GMS, search volume, conversion, return rate, price tier, competitor density, …) — or use as a "category detail" endpoint by passing a single categoryId.
Use when: user says "find categories worth entering" / "high-sales categories" / "low return-rate categories" / "high search-volume but low competition categories" / "show me all metrics for category X"; category-level blue-ocean hunt; getting the 30+ metric snapshot of one category.
Don't use: for niche-level (use filter_niches — finer granularity); for actual products in a category (use list_category_products); for just the readable name (use get_category_paths).
Returns: data.items.data[{ id, categoryId, marketplaceId, timeRange, sampleScope, snapshotDate, unitSoldSum, glanceViewsSum, searchVolumeSum, netShippedGmsSum, buyBoxPriceAvg, buyBoxPriceTier, searchToPurchaseRatio, returnRatio, asinCount, offersPerAsin, newAsinCount, newBrandCount, avgAdSpendPerClick, unitSoldTrendDirection, unitSoldChangeRateBucket, ... trend + quantile-bucket fields }] + data.items.pagination.{ total, page, size, hasNext }. **Pagination**: use the 'page' param (default 1, 1-based, size capped at 10); 'pagination.hasNext=true' means more pages exist, 'hasNext=false' means last page.
Pair with: ↑ required timeRange ('l7d' common) + sampleScope ('all_asin') + marketplaceId (defaults US); categoryId from search_categories / get_category_children; ↓ feed high-potential categories into list_category_products / list_bestsellers for real listings.
Cost: ~1 point/page, ~5s.
Tips: size capped at 10 (backend hard limit); only paginate when the user explicitly asks for more candidate categories — single-detail or quick-filter calls are fine on page 1; long-tail filter fields (unitSoldTrendDirections / metricChangeRateBuckets / dozens more) pass through via extraFilters.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const { extraFilters, ...rest } = input;
    const body = { ...rest, ...(extraFilters ?? {}) };
    ctx.logger.info(
      `filter_categories: marketplaceId=${input.marketplaceId} timeRange=${input.timeRange} sampleScope=${input.sampleScope} categoryId=${input.categoryId ?? "(none)"} page=${input.page} size=${input.size}`,
    );
    return ctx.client.post("/api/v1/amzscope/categories/filter", body);
  },
};
