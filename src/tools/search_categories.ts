/**
 * Pangolinfo MCP - tool: search_categories
 *
 * Per CONTRACT.md §2 / §8 and CONTRACT-tools.md §5 — search the
 * Amazon BSR category tree by keyword via
 * POST /api/v1/amzscope/categories/search on scrape_base.
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
        zh: "类目名称关键词（中英文均可）。Examples: 'headphones' / 'kitchen knives' / '无线耳机' / 'wireless earbuds'。",
        en: "Category name keyword (Chinese or English). Examples: 'headphones' / 'kitchen knives' / '无线耳机' / 'wireless earbuds'.",
      }),
    ),
  site: z
    .enum(["amz_us", "amz_uk", "amz_de", "amz_jp"])
    .default("amz_us")
    .describe(
      t({
        zh: "搜索的 Amazon 站点。默认 amz_us（美国站）。",
        en: "Marketplace to search categories in. Defaults to 'amz_us'.",
      }),
    ),
});

export const searchCategories: Tool<typeof inputSchema> = {
  name: "search_categories",
  description: t({
    zh: `[Amazon 类目搜索] 用关键词（中英文均可）匹配 Amazon 类目树，返回候选类目节点。
Use when: 用户给的是关键词而非类目 ID，下游需要 categoryId / browseNodeId（如想跑 filter_niches / filter_categories / list_category_products / list_bestsellers slug 推测）；想知道某个商品概念在 Amazon 类目体系里挂在哪。
Don't use: 已经有 categoryId/nodeId（直接用 get_category_paths 取面包屑或下游 filter）；想树状下钻看子类目（用 get_category_children）。
Returns: data.items.data[{ browseNodeId, browseNodeIdPath, browseNodeName, browseNodeNameCn, browseNodeNamePath, browseNodeNamePathCn, parentBrowseNodeIdPath, productType, sellable, hasChild }] + pagination。
Pair with: ↓ 拿到 browseNodeId 后喂 list_category_products / list_bestsellers (用 path 推 slug) / filter_niches / filter_categories；↓ 喂 get_category_children 继续下钻；↓ 喂 get_category_paths 取面包屑。
Cost: ~1 积点/次, ~3s。`,
    en: `[Amazon category search] Match Amazon's category tree by keyword (Chinese or English) and return candidate nodes.
Use when: user gave a keyword/concept rather than a category id, and a downstream tool needs categoryId / browseNodeId (e.g. filter_niches / filter_categories / list_category_products / inferring list_bestsellers slug); when you need to know where a product concept lives in Amazon's taxonomy.
Don't use: when you already have categoryId/nodeId (use get_category_paths for breadcrumbs or a downstream filter directly); when you want to drill the subtree (use get_category_children).
Returns: data.items.data[{ browseNodeId, browseNodeIdPath, browseNodeName, browseNodeNameCn, browseNodeNamePath, browseNodeNamePathCn, parentBrowseNodeIdPath, productType, sellable, hasChild }] + pagination.
Pair with: ↓ feed browseNodeId into list_category_products / list_bestsellers (derive slug from path) / filter_niches / filter_categories; ↓ feed into get_category_children to drill further; ↓ feed into get_category_paths for breadcrumbs.
Cost: ~1 point/call, ~3s.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(
      `search_categories: keyword="${input.keyword}" site=${input.site}`,
    );
    return ctx.client.post("/api/v1/amzscope/categories/search", input);
  },
};
