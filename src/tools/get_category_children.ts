/**
 * Pangolinfo MCP - tool: get_category_children
 *
 * Wraps POST /api/v1/amzscope/categories/children on scrape_base.
 *
 * Behaviour (per backend doc, "Category Tree API"):
 *  - Omit `parentBrowseNodeIdPath` to list the top-level roots.
 *  - Pass a single node id (e.g. "2619526011") to list its direct
 *    children, or a slash-joined path (e.g. "2619526011/18116197011")
 *    to drill deeper. The backend echoes a full `browseNodeIdPath`
 *    on each item that can be fed back in for the next level.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  parentBrowseNodeIdPath: z
    .string()
    .optional()
    .describe(
      t({
        zh: "父节点路径。可填单个 browseNodeId 或斜杠分隔的完整路径。Examples: '2619526011' (Appliances, 顶级下钻) / '2619526011/18116197011' (Appliances > Ranges/Ovens/Cooktops, 三级下钻)。留空则返回顶级根节点。",
        en: "Parent node path. Either a single browseNodeId or a slash-joined path. Examples: '2619526011' (Appliances, drill from top) / '2619526011/18116197011' (Appliances > Ranges/Ovens/Cooktops, level-3 drill). Omit to fetch top-level roots.",
      }),
    ),
  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      t({
        zh: "页码，从 1 开始。",
        en: "Page number, 1-based.",
      }),
    ),
  size: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe(
      t({
        zh: "每页条数。",
        en: "Page size.",
      }),
    ),
});

export const getCategoryChildren: Tool<typeof inputSchema> = {
  name: "get_category_children",
  description: t({
    zh: `[Amazon 类目树下钻] 从根节点或任意类目逐级下钻，列出直接子类目。
Use when: 用户说"看一下 Amazon 类目树""X 类目下有什么子类""列出顶级大类""下钻到三级类目"；做类目地图时；search_categories 给了多个候选类目想看哪个层级合适。
Don't use: 想按关键词跳到类目（用 search_categories 更快）；想要类目下的商品列表而非子类目（用 list_category_products）。
Returns: data.items.data[{ browseNodeId, browseNodeIdPath, browseNodeName, browseNodeNameCn, parentBrowseNodeIdPath, productType, sellable, hasChild }]; 留空 parentBrowseNodeIdPath 返回顶级根节点；hasChild=1 说明可继续下钻。
Pair with: ↑ 起点 parentBrowseNodeIdPath 可留空（顶级）或来自 search_categories；↓ 每条结果的 browseNodeIdPath 可喂回本工具再下钻一层，或喂 list_category_products / filter_categories。
Cost: ~1 积点/次, ~3s。`,
    en: `[Amazon category tree drilldown] List direct children from any node (or omit parent to start at the roots).
Use when: user says "show me Amazon's category tree" / "subcategories under X" / "list top-level departments" / "drill to level 3"; building a category map; deciding which level is right after search_categories returned candidates.
Don't use: when a keyword jump is faster (use search_categories); when you want products in the category, not its subcategories (use list_category_products).
Returns: data.items.data[{ browseNodeId, browseNodeIdPath, browseNodeName, browseNodeNameCn, parentBrowseNodeIdPath, productType, sellable, hasChild }]; omit parentBrowseNodeIdPath to fetch top-level roots; hasChild=1 means the node has further children.
Pair with: ↑ parentBrowseNodeIdPath either omitted (roots) or from search_categories; ↓ feed each result's browseNodeIdPath back in to drill another level, or into list_category_products / filter_categories.
Cost: ~1 point/call, ~3s.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(
      `get_category_children: path=${input.parentBrowseNodeIdPath ?? "(root)"} page=${input.page} size=${input.size}`,
    );
    return ctx.client.post("/api/v1/amzscope/categories/children", input);
  },
};
