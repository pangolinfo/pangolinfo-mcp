/**
 * Pangolinfo MCP - tool: get_category_paths
 *
 * Per CONTRACT.md §2 / §8 and CONTRACT-tools.md §7 — resolve full
 * category breadcrumb paths for given category IDs via
 * POST /api/v1/amzscope/categories/paths on scrape_base.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  categoryIds: z
    .array(z.string())
    .min(1)
    .describe(
      t({
        zh: "要解析完整路径的类目 ID 列表。Examples: ['2619526011'] (Appliances) / ['172282', '11965861'] (Electronics + Musical Instruments)。",
        en: "Category IDs to resolve full path for. Examples: ['2619526011'] (Appliances) / ['172282', '11965861'] (Electronics + Musical Instruments).",
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
});

export const getCategoryPaths: Tool<typeof inputSchema> = {
  name: "get_category_paths",
  description: t({
    zh: `[Amazon 类目面包屑解析] 批量把 categoryId 还原成完整路径（如 'Electronics > Headphones > Over-Ear Headphones'）。
Use when: 报告/分析里需要展示类目上下文（不是裸 ID）；用户只有一组数字 ID 想知道它们叫什么；多个类目对比时需要可读名字。
Don't use: 只有一个 ID 时其实用不上（其他 tool 返回里通常已带 browseNodeNamePath）；想看类目树结构（用 get_category_children）。
Returns: data.items[{ categoryId, categoryName, categoryNameCn, browseNodeNamePaths[], browseNodeNamePathCns[] }] —— 输入数组多大就返回多大。
Pair with: ↑ categoryIds 从任何前一步拿（filter_niches/filter_categories 的输出、用户粘的 ID 列表）；↓ 主要给人看，下游链路通常不依赖。
Cost: ~1 积点/次, ~2s（批量解析比单调多次便宜）。`,
    en: `[Amazon category breadcrumb resolver] Batch-resolve categoryId list to full paths (e.g. 'Electronics > Headphones > Over-Ear Headphones').
Use when: a report needs readable category context (not bare IDs); user has a list of numeric IDs and wants the names; multiple categories need labels for comparison.
Don't use: for a single ID — most other tools already return browseNodeNamePath in their responses; for tree structure (use get_category_children).
Returns: data.items[{ categoryId, categoryName, categoryNameCn, browseNodeNamePaths[], browseNodeNamePathCns[] }] — one row per input ID.
Pair with: ↑ categoryIds from any prior step (filter_niches/filter_categories output, user-pasted ID list); ↓ usually presentation-only, downstream rarely depends on it.
Cost: ~1 point/call, ~2s (cheaper than N single resolutions).`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(
      `get_category_paths: ids=${input.categoryIds.join(",")} site=${input.site}`,
    );
    return ctx.client.post("/api/v1/amzscope/categories/paths", input);
  },
};
