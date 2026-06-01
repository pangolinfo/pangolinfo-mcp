/**
 * Pangolinfo MCP - tool: scrape_url
 *
 * Power-user escape hatch. Wraps POST /api/v1/scrape directly with a raw
 * Amazon URL + an explicit parserName, for pages the 5 purpose-built tools
 * (search_amazon / get_amazon_product / list_* ) don't cover — e.g. a
 * filtered/sorted search URL, a deals page, a brand storefront URL, a
 * follow-seller (Buy Box) URL, or a variant page.
 *
 * Why this exists separately instead of adding `url` to search_amazon:
 * search_amazon is locked to parserName=amzKeyword. A raw URL paired with the
 * wrong parser returns garbage rawHtml. Keeping a dedicated tool forces the
 * caller to pick a matching parserName explicitly.
 *
 * IMPORTANT — url and parserName MUST match, or the backend returns unparsed
 * rawHtml (status_code/rawHtml envelope) instead of structured `results`.
 * Prefer the purpose-built tool whenever one fits; only reach here for
 * non-standard pages.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const PARSERS = [
  "amzKeyword",
  "amzProductDetail",
  "amzProductOfCategory",
  "amzProductOfSeller",
  "amzBestSellers",
  "amzNewReleases",
  "amzReviewV2",
  "amzFollowSeller",
  "amzVariantAsin",
] as const;

const inputSchema = z.object({
  url: z
    .string()
    .url()
    .describe(
      t({
        zh: "完整的 Amazon 页面 URL(必须 https://)。要跟 parserName 匹配,否则返回未解析的 rawHtml。Examples: 'https://www.amazon.com/s?k=wireless+earbuds&rh=p_36:2500-5000'(带价格筛选的 SERP,配 amzKeyword) / 'https://www.amazon.com/dp/B09B8V1LZ3'(配 amzProductDetail) / 'https://www.amazon.com/sp?seller=ATVPDKIKX0DER'(配 amzProductOfSeller)。",
        en: "Full Amazon page URL (must be https://). Must match parserName, else the backend returns unparsed rawHtml. Examples: 'https://www.amazon.com/s?k=wireless+earbuds&rh=p_36:2500-5000' (price-filtered SERP, with amzKeyword) / 'https://www.amazon.com/dp/B09B8V1LZ3' (with amzProductDetail) / 'https://www.amazon.com/sp?seller=ATVPDKIKX0DER' (with amzProductOfSeller).",
      }),
    ),
  parserName: z
    .enum(PARSERS)
    .describe(
      t({
        zh: "解析器名,决定后端怎么解析这个 URL。必须和 url 的页面类型匹配:amzKeyword=搜索结果页(/s?k=...)/ amzProductDetail=单品页(/dp/ASIN)/ amzProductOfCategory=类目商品列表 / amzProductOfSeller=卖家店铺(/sp?seller=...)/ amzBestSellers=热销榜 / amzNewReleases=新品榜 / amzReviewV2=评论页 / amzFollowSeller=跟卖(Buy Box)页 / amzVariantAsin=变体页。",
        en: "Parser that decides how the backend extracts this URL. Must match the page type: amzKeyword=search results (/s?k=...) / amzProductDetail=single product (/dp/ASIN) / amzProductOfCategory=category listing / amzProductOfSeller=seller storefront (/sp?seller=...) / amzBestSellers=bestsellers / amzNewReleases=new releases / amzReviewV2=reviews / amzFollowSeller=follow-seller (Buy Box) / amzVariantAsin=variant page.",
      }),
    ),
  format: z
    .enum(["json", "markdown"])
    .default("json")
    .describe(
      t({
        zh: "返回格式。默认 'json'(结构化 results);需要原始页面阅读时切 'markdown'。",
        en: "Response format. Defaults to 'json' (structured results). Use 'markdown' for the rendered page text.",
      }),
    ),
  zipcode: z
    .string()
    .optional()
    .describe(
      t({
        zh: "邮编,必须匹配 site 所在国家(amz_us → 美国邮编)。可选;不传时后端随机挑一个。",
        en: "ZIP code matching the site's country (amz_us → US zip). Optional; backend picks one if omitted.",
      }),
    ),
});

export const scrapeUrl: Tool<typeof inputSchema> = {
  name: "scrape_url",
  description: t({
    zh: `[通用 Amazon URL 抓取 — 高级逃生口] 直接传一个完整 Amazon URL + parserName 抓页面。仅用于 5 个专用工具(search_amazon / get_amazon_product / list_bestsellers / list_new_releases / list_category_products / list_seller_products)覆盖不到的非标准页面:带筛选/排序参数的搜索 URL、deals 页、品牌旗舰店 URL、跟卖(Buy Box)页、变体页。
Use when: 用户已经有一个**具体 Amazon URL**(带复杂筛选/排序 query),或要抓的页面类型现有专用工具不支持;"按这个 amazon 链接抓""这个筛选后的搜索结果页"。
Don't use: 普通关键词搜索(用 search_amazon)/ 单 ASIN 详情(用 get_amazon_product)/ 卖家店铺(用 list_seller_products,只要 sellerId 不用拼 url)/ 类目榜单(用 list_bestsellers / list_new_releases)。**能用专用工具就别用这个** —— 专用工具帮你拼对 url + parserName,这个要你自己保证匹配。
Returns (format='json'): data.json[0].data.{ ... results[] ... },结构随 parserName 而定(同对应专用工具的返回)。⚠️ 若 url 与 parserName 不匹配,后端返回 data.{ status_code, rawHtml, url }(未解析),不是 results。
Pair with: ↓ 拿到 asin 喂 get_amazon_product / get_amazon_reviews。
Cost: ~1 积点/次, ~5s。
⚠️ url 与 parserName **必须匹配**,否则拿到 rawHtml 垃圾。优先用专用工具。`,
    en: `[Generic Amazon URL scrape — power-user escape hatch] POST a full Amazon URL + a parserName directly. Use ONLY for non-standard pages the 6 purpose-built tools (search_amazon / get_amazon_product / list_bestsellers / list_new_releases / list_category_products / list_seller_products) don't cover: filtered/sorted search URLs, deals pages, brand storefront URLs, follow-seller (Buy Box) pages, variant pages.
Use when: the user already has a **specific Amazon URL** (with complex filter/sort query), or the target page type isn't covered by a purpose-built tool; "scrape this amazon link" / "this filtered search results page".
Don't use: plain keyword search (use search_amazon) / single-ASIN detail (use get_amazon_product) / seller storefront (use list_seller_products — takes sellerId, no URL needed) / category ranks (use list_bestsellers / list_new_releases). **Prefer a purpose-built tool whenever one fits** — those build the correct url + parserName for you; here you must ensure they match.
Returns (format='json'): data.json[0].data.{ ... results[] ... }, shape depends on parserName (same as the matching purpose-built tool). ⚠️ If url and parserName don't match, the backend returns data.{ status_code, rawHtml, url } (unparsed), not results.
Pair with: ↓ feed asin into get_amazon_product / get_amazon_reviews.
Cost: ~1 point/call, ~5s.
⚠️ url and parserName MUST match or you get garbage rawHtml. Prefer the purpose-built tools.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(
      `scrape_url: parserName=${input.parserName} format=${input.format} url=${input.url}`,
    );

    // Mirror search_amazon's body shape: the full URL carries the domain, so
    // we send url + parserName + format + timeout (+ bizContext). We do NOT
    // send `site` here — the URL is authoritative for the marketplace.
    return ctx.client.post("/api/v1/scrape", {
      url: input.url,
      parserName: input.parserName,
      format: input.format,
      timeout: 60000,
      ...(input.zipcode ? { bizContext: { zipcode: input.zipcode } } : {}),
    });
  },
};
