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
import { getAmazonVideos } from "./get_amazon_videos.js";
import { getAmazonDeliveryTime } from "./get_amazon_delivery_time.js";
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
import { calculateAmazonProfit } from "./calculate_amazon_profit.js";
import { aiSearch } from "./ai_search.js";
import { keywordTrends } from "./keyword_trends.js";
import { scrapeUrl } from "./scrape_url.js";
import { searchAmazonAlexa } from "./search_amazon_alexa.js";
import { getAmazonAlexaQuestions } from "./get_amazon_alexa_questions.js";
import { pangolinfoCapabilities } from "./pangolinfo_capabilities.js";
import { collectEcommerceData } from "./collect_ecommerce_data.js";

/**
 * 22 个工具：21 个同步业务工具 + 1 个本地自省工具。
 * pangolinfo_capabilities 放在第一位 — 这是 AI 第一次接入时建议先调的自省接口。
 * 注：scrape_url 通用逃生口于 0.6.0 新增。
 *     search_amazon_alexa (Rufus): 0.5.0 移除 → 0.6.1 加回 → 0.6.2 移除 → 0.6.3 恢复
 *     (上游 alexa API 已恢复支持;参数格式 parserName=amazonAlexa + param[] + screenshot)。
 *     本次统一 MCP 排除社媒、全部 V3 及异步能力；保留旧实现供追溯。
 */
export const tools: Tool[] = [
  pangolinfoCapabilities,
  collectEcommerceData,
  searchAmazon,
  getAmazonProduct,
  getAmazonVideos,
  getAmazonDeliveryTime,
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
  calculateAmazonProfit,
  aiSearch,
  keywordTrends,
  scrapeUrl,
  searchAmazonAlexa,
  getAmazonAlexaQuestions,
];
