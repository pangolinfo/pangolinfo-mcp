/**
 * Pangolinfo MCP - tool: scrape_url
 *
 * Power-user / escape-hatch wrapper over POST /api/v1/scrape.
 *
 * Two ways to point it at a page (the backend AmazonUrlBuilder accepts both):
 *   1. `content` + `site` — a BARE fragment (keyword / nodeId / sellerId /
 *      ASIN) and the backend builds the correct Amazon URL for the given
 *      parserName. This is what users/AI usually have on hand.
 *   2. `url` — a FULL Amazon URL you already have (e.g. a filtered/sorted
 *      SERP link copied from the browser). Passed through; the backend only
 *      appends low-price/high-price/page params if you also set those.
 *
 * Pass exactly one of content / url. parserName must match the page type or
 * the backend returns unparsed rawHtml.
 *
 * Optional filters (startPrice / endPrice / page) map to the backend
 * low-price / high-price / page query params — these only take effect on
 * search/category style pages.
 *
 * Prefer a purpose-built tool whenever one fits (search_amazon /
 * get_amazon_product / list_*). Reach here for pages they don't cover:
 * price-filtered search, category + price filter, follow-seller, variants.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { PangolinfoError } from "../errors.js";
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
  parserName: z
    .enum(PARSERS)
    .describe(
      t({
        zh: "解析器名,决定后端怎么解析页面 + 怎么从 content 拼 URL。必须和页面类型匹配:amzKeyword=关键词搜索(content=关键词)/ amzProductOfCategory=类目商品(content=nodeId)/ amzProductOfSeller=卖家店铺(content=sellerId)/ amzProductDetail=单品(content=ASIN)/ amzBestSellers / amzNewReleases / amzReviewV2=评论 / amzFollowSeller=跟卖 / amzVariantAsin=变体。",
        en: "Parser deciding how the backend extracts the page AND builds the URL from content. Must match the page type: amzKeyword=keyword search (content=keyword) / amzProductOfCategory=category (content=nodeId) / amzProductOfSeller=seller storefront (content=sellerId) / amzProductDetail=single product (content=ASIN) / amzBestSellers / amzNewReleases / amzReviewV2=reviews / amzFollowSeller=follow-seller / amzVariantAsin=variant.",
      }),
    ),
  content: z
    .string()
    .optional()
    .describe(
      t({
        zh: "裸零件(后端按 parserName 自动拼 URL)。传这个**或** url 二选一。Examples: 'wireless earbuds'(amzKeyword)/ '172282'(amzProductOfCategory 的 nodeId)/ 'ATVPDKIKX0DER'(amzProductOfSeller 的 sellerId)/ 'B09B8V1LZ3'(amzProductDetail 的 ASIN)。用户/AI 通常只有零件,优先用这个。",
        en: "Bare fragment (backend builds the URL per parserName). Pass this OR url. Examples: 'wireless earbuds' (amzKeyword) / '172282' (nodeId for amzProductOfCategory) / 'ATVPDKIKX0DER' (sellerId for amzProductOfSeller) / 'B09B8V1LZ3' (ASIN for amzProductDetail). Users/AI usually only have the fragment — prefer this.",
      }),
    ),
  url: z
    .string()
    .url()
    .optional()
    .describe(
      t({
        zh: "完整 Amazon URL(https://)。传这个**或** content 二选一。用于你已经有一个现成链接(如浏览器复制的带筛选/排序的搜索结果页)。Example: 'https://www.amazon.com/s?k=earbuds&rh=p_36%3A2500-5000&s=review-rank'。必须和 parserName 匹配。",
        en: "Full Amazon URL (https://). Pass this OR content. Use when you already have a ready link (e.g. a filtered/sorted SERP copied from the browser). Example: 'https://www.amazon.com/s?k=earbuds&rh=p_36%3A2500-5000&s=review-rank'. Must match parserName.",
      }),
    ),
  site: z
    .enum([
      "amz_us",
      "amz_uk",
      "amz_de",
      "amz_jp",
      "amz_fr",
      "amz_it",
      "amz_es",
      "amz_ca",
      "amz_au",
      "amz_sa",
      "amz_ae",
      "amz_br",
      "amz_mx",
    ])
    .default("amz_us")
    .describe(
      t({
        zh: "Amazon 站点(content 模式下后端据此选域名拼 URL)。默认 amz_us。url 模式下可省略(url 已含域名)。",
        en: "Amazon site (in content mode the backend picks the domain from this). Defaults to amz_us. Optional in url mode (the URL already has the domain).",
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
        zh: "邮编,必须匹配 site 所在国家。可选;不传时后端随机挑一个。",
        en: "ZIP code matching the site's country. Optional; backend picks one if omitted.",
      }),
    ),
});

export const scrapeUrl: Tool<typeof inputSchema> = {
  name: "scrape_url",
  description: t({
    zh: `[通用 Amazon 抓取 — 高级逃生口] 抓 5 个专用工具覆盖不到的页面。两种喂法二选一:
① content=裸零件(关键词/nodeId/sellerId/ASIN)+ site,后端按 parserName 自动拼基础 URL。**content 模式不带筛选/排序/翻页** —— 只是裸零件。用户/AI 通常只有零件,简单页用这个最省事。
② url=完整 Amazon 链接,**任何筛选/排序/翻页都拼进这个 url**(content 模式做不到的全靠它)。筛选语法举例:价格 $25-50 → '/s?k=earbuds&low-price=25&high-price=50';按评论数排序 → '&s=review-rank';翻页 → '&page=2';类目+价格 → '/s?i=aps&rh=n%3A172282&fs=true&low-price=25'。
Use when: 普通工具拼不出目标 URL —— "搜 X 但只要 $25-50""按评论排序的结果""类目按价格筛";或用户已有一个具体 Amazon 链接要抓。要带筛选就走 url 模式。
Don't use: 能用专用工具就别用 —— 纯关键词搜索用 search_amazon、单 ASIN 用 get_amazon_product、卖家用 list_seller_products、类目榜单用 list_bestsellers/list_new_releases。
Returns (format='json'): data.json[0].data.{ ... results[] ... },结构随 parserName 而定。⚠️ content/url 与 parserName 不匹配 → 后端返回 data.{ status_code, rawHtml, url }(未解析)。
Pair with: ↓ 拿到 asin 喂 get_amazon_product / get_amazon_reviews。
Cost: ~1 积点/次, ~5s。
⚠️ content 和 url 二选一(都传或都不传会报错);带筛选/翻页必须用 url 模式;parserName 必须和页面类型匹配。`,
    en: `[Generic Amazon scrape — power-user escape hatch] Scrape pages the 5 purpose-built tools don't cover. Two input modes (pick one):
① content=bare fragment (keyword / nodeId / sellerId / ASIN) + site — backend builds a basic URL per parserName. **content mode carries NO filter/sort/pagination** — it's just the bare fragment. Best for simple pages when you only have the fragment.
② url=full Amazon link — **put ANY filter/sort/pagination into this url** (the only way, since content mode can't). Filter syntax examples: price $25-50 → '/s?k=earbuds&low-price=25&high-price=50'; sort by reviews → '&s=review-rank'; paginate → '&page=2'; category+price → '/s?i=aps&rh=n%3A172282&fs=true&low-price=25'.
Use when: a standard tool can't build the target URL — "search X but only $25-50" / "results sorted by reviews" / "category filtered by price"; or the user already has a specific Amazon link. For any filtering, use url mode.
Don't use: when a purpose-built tool fits — plain keyword search → search_amazon, single ASIN → get_amazon_product, seller → list_seller_products, category ranks → list_bestsellers/list_new_releases.
Returns (format='json'): data.json[0].data.{ ... results[] ... }, shape depends on parserName. ⚠️ If content/url doesn't match parserName, the backend returns data.{ status_code, rawHtml, url } (unparsed).
Pair with: ↓ feed asin into get_amazon_product / get_amazon_reviews.
Cost: ~1 point/call, ~5s.
⚠️ Pass exactly one of content / url (both or neither errors); filtering/pagination requires url mode; parserName must match the page type.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const hasContent = !!input.content?.trim();
    const hasUrl = !!input.url?.trim();
    if (hasContent === hasUrl) {
      throw new PangolinfoError(
        "BAD_INPUT",
        400,
        "scrape_url requires exactly one of: content (bare fragment) or url (full URL). You passed " +
          (hasContent ? "both" : "neither") +
          ".",
      );
    }

    ctx.logger.info(
      `scrape_url: parserName=${input.parserName} ${hasUrl ? `url=${input.url}` : `content=${input.content} site=${input.site}`} format=${input.format}`,
    );

    const body: Record<string, unknown> = {
      parserName: input.parserName,
      format: input.format,
      timeout: 60000,
    };
    if (hasUrl) {
      body.url = input.url;
    } else {
      body.content = input.content;
      body.site = input.site;
    }
    if (input.zipcode) body.bizContext = { zipcode: input.zipcode };

    return ctx.client.post("/api/v1/scrape", body);
  },
};
