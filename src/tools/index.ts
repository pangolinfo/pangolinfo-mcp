/**
 * Pangolinfo MCP - tool registry.
 *
 * Per CONTRACT.md §0 — `server.ts` reads this list and registers
 * each tool with the MCP SDK. Adding a new tool means: implement
 * `<name>.ts`, import it here, append to the array.
 */

import type { Tool } from "./_types.js";

import { searchAmazon } from "./search_amazon.js";
import { getAmazonProduct } from "./get_amazon_product.js";
import { getAmazonReviews } from "./get_amazon_reviews.js";
import { listBestsellers } from "./list_bestsellers.js";
import { listNewReleases } from "./list_new_releases.js";
import { listSellerProducts } from "./list_seller_products.js";
import { listCategoryProducts } from "./list_category_products.js";
import { searchCategories } from "./search_categories.js";
import { getCategoryChildren } from "./get_category_children.js";
import { filterCategories } from "./filter_categories.js";
import { filterNiches } from "./filter_niches.js";
import { getCategoryPaths } from "./get_category_paths.js";
import { searchLocalMaps } from "./search_local_maps.js";
import { wipoSearch } from "./wipo_search.js";
import { aiSearch } from "./ai_search.js";
import { keywordTrends } from "./keyword_trends.js";
import { searchAmazonAlexa } from "./search_amazon_alexa.js";
import { pangolinfoCapabilities } from "./pangolinfo_capabilities.js";

/**
 * v0.3.0 真实可用 = 18 个 tool（17 业务 + 1 自省 pangolinfo_capabilities）。
 * pangolinfo_capabilities 放在第一位 — 这是 AI 第一次接入时建议先调的自省接口。
 */
export const tools: Tool[] = [
  pangolinfoCapabilities,
  searchAmazon,
  getAmazonProduct,
  getAmazonReviews,
  listBestsellers,
  listNewReleases,
  listSellerProducts,
  listCategoryProducts,
  searchCategories,
  getCategoryChildren,
  filterCategories,
  filterNiches,
  getCategoryPaths,
  searchLocalMaps,
  wipoSearch,
  aiSearch,
  keywordTrends,
  searchAmazonAlexa,
];
