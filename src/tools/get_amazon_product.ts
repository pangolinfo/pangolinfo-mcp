/**
 * Pangolinfo MCP - tool: get_amazon_product
 *
 * Per CONTRACT.md §2 / §8 — fetch full product detail for a single ASIN
 * via POST /api/v1/scrape.
 *
 * Backend dispatch (verified 2026-05-19 against scrapeapi prod):
 *   - `format=json` routes the raw HTML through a gRPC parser keyed by
 *     `parserName`. For PDP pages that parser is `amzProductDetail` —
 *     returns a structured `{results:[{title, seller, rating,
 *     ratingDistribution, galleryThumbnails, aiReviewsSummary, ...}]}`
 *     payload.
 *
 *   So `format=json` ALONE returns empty (`data.json: []`) because no
 *   parser is wired in — we must always pair it with `parserName`.
 *   The MCP always requests `format=json`.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  asin: z
    .string()
    .regex(
      /^[A-Za-z0-9]{10}$/,
      "ASIN must be 10 letters/digits (case-insensitive; auto-uppercased)",
    )
    .describe(
      t({
        zh: "Amazon ASIN，10 位字母+数字（大小写均可，会自动转大写）。Example: 'B0B4NLGCH5'。",
        en: "Amazon ASIN, 10 letters/digits (case-insensitive — auto-uppercased). Example: 'B0B4NLGCH5'.",
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
        zh: "Amazon 站点。默认 amz_us（美国站）。",
        en: "Amazon marketplace. Defaults to 'amz_us' (US).",
      }),
    ),
  zipcode: z
    .string()
    .optional()
    .describe(
      t({
        zh: "邮编，必须匹配 site 站点所在国家（amz_us → 美国邮编，amz_jp → 日本邮编 …）。可选；不传时后端会从对应国家邮编池随机挑一个。跨国邮编（如 amz_us + 日本邮编）会被后端拒绝。Examples: 10001 (NY) / 90001 (LA) / 100-0001 (Tokyo).",
        en: "ZIP code that must match the site country (amz_us → US zip, amz_jp → JP zip, ...). Optional; backend picks a random one from the per-country pool when omitted. Cross-country zips (e.g. amz_us + JP zip) are rejected by the backend. Examples: 10001 (NY) / 90001 (LA) / 100-0001 (Tokyo).",
      }),
    ),
});

const SITE_TO_DOMAIN: Record<string, string> = {
  amz_us: "www.amazon.com",
  amz_uk: "www.amazon.co.uk",
  amz_de: "www.amazon.de",
  amz_jp: "www.amazon.co.jp",
  amz_fr: "www.amazon.fr",
  amz_it: "www.amazon.it",
  amz_es: "www.amazon.es",
  amz_ca: "www.amazon.ca",
  amz_au: "www.amazon.com.au",
  amz_sa: "www.amazon.sa",
  amz_ae: "www.amazon.ae",
  amz_br: "www.amazon.com.br",
  amz_mx: "www.amazon.com.mx",
};

export const getAmazonProduct: Tool<typeof inputSchema> = {
  name: "get_amazon_product",
  description: t({
    zh: `[Amazon 单品详情] 按 ASIN 抓某个具体商品的完整 PDP 数据。
Use when: 用户给了具体 ASIN（B0XXXXXXXX）要"看一下这个产品""查它的价格/评分/卖家""分析这个竞品"；或 SOP 中拿到候选 ASIN 后需要深拆。
Don't use: 一次想看多个商品的简要对比（用 search_amazon 或 list_* 系列拿列表）；只要评论（用 get_amazon_reviews 更专一便宜）。
Returns: data.json[0].data.results[0] = { asin, title, itemName, itemHighlights, price, star, rating, brand, seller{name,id,link,hasLink}, parentAsin, videos[{type,section,mp4,m3u8,previewMp4,cover,title,duration,author}], shippingFee（买家配送料数字，如 "750"；免运费/无信息为 "0"，随 zipcode 对应地址变化）, delivery{deliveryTime,fastestDelivery}, ratingDistribution[], aiReviewsSummary, bestSellersRankItems, reviews[{date,star,content,helpful,...}], productOverview[], features[], productDescription[], images[], variantDetails[], attributes[], category_id, breadCrumbs, ... } — 30+ 字段（含 variantDetails 简表）。videos[].section：product=主图画廊、brand=品牌模块、related=相关视频、customerReview=买家评论视频。需要高退货提示、免运费/付费/最快配送细分和备货时长时，改用 get_amazon_delivery_time。
类目字段：category_id 是末级面包屑的 Browse Node ID，category_name 取同一级名称；该级无有效 ID 或页面无面包屑时 ID 为空字符串，不以父类目或 Amazon 内部 categoryId 替代。
不存在的 ASIN：当前站点明确未找到时返回 9204，message 含请求 ASIN，正常计费；不自动重试。
标题字段说明：title 保留现有主标题；itemName 为商品名称；itemHighlights 是固定的副标题/亮点字段，优先取页面独立副标题，其次取主标题分隔符后段，最后从已解析的 Item Highlight / Item Highlights 属性回填。无可识别内容时返回空字符串，不按字符数截断。读取亮点请使用 JSON 的 data.json[0].data.results[0].itemHighlights。
Pair with: ↑ asin 常来自 search_amazon / list_bestsellers / filter_niches；↓ 同一 asin 喂 get_amazon_reviews 取更多评论（默认 PDP 只带 5-10 条 reviews）。
Cost: ~1 积点/次, ~5s。`,
    en: `[Amazon single-product detail] Scrape the full PDP for one ASIN.
Use when: user supplies a specific ASIN ("look at B0XXXXXXXX" / "check this product's price/rating/seller" / "analyse this competitor"); or as a SOP step after candidate ASINs are picked.
Don't use: for many products at once (use search_amazon or list_* series for lists); for reviews only (use get_amazon_reviews — cheaper and more focused).
Returns: data.json[0].data.results[0] = { asin, title, itemName, itemHighlights, price, star, rating, brand, seller{name,id,link,hasLink}, parentAsin, videos[{type,section,mp4,m3u8,previewMp4,cover,title,duration,author}], shippingFee (buyer shipping fee as a number, e.g. "750"; "0" when free shipping or no info, varies by the zipcode address), delivery{deliveryTime,fastestDelivery}, ratingDistribution[], aiReviewsSummary, bestSellersRankItems, reviews[{date,star,content,helpful,...}], productOverview[], features[], productDescription[], images[], variantDetails[], attributes[], category_id, breadCrumbs, ... } — 30+ fields (variantDetails summary included). videos[].section: product=main media gallery, brand=brand module, related=related videos, customerReview=customer review videos. Use get_amazon_delivery_time when you need the high-return warning, free/paid/fastest delivery breakdown, or handling lead time.
Category fields: category_id is the Browse Node ID of the final breadcrumb; category_name uses that same breadcrumb. The ID is an empty string if the final breadcrumb has no valid ID or breadcrumbs are absent; parent IDs and Amazon internal categoryId codes are not substituted.
Missing ASIN: confirmed absence on the requested marketplace returns 9204 with the ASIN in message; normal billing applies. Do not auto-retry.
Title fields: title preserves the existing main title; itemName is the product name; itemHighlights is the stable subtitle/highlights field. Prefers the dedicated subtitle, then the main-title suffix, then an already parsed Item Highlight / Item Highlights attribute. Empty string when no recognized content is available; no character-limit truncation. Read data.json[0].data.results[0].itemHighlights in JSON.
Pair with: ↑ asin typically comes from search_amazon / list_bestsellers / filter_niches; ↓ feed the same asin into get_amazon_reviews for more reviews (the PDP carries only ~5-10).
Cost: ~1 point/call, ~5s.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    // Normalize to uppercase: the backend does not validate ASIN format
    // (it's a passthrough List<String>), and Amazon's /dp/ canonical form
    // is uppercase. Agents frequently pass a lowercased asin copied from a
    // URL; upper-casing here avoids a needless miss without a stricter
    // schema that would reject the lowercase outright.
    const asin = input.asin.toUpperCase();
    const domain = SITE_TO_DOMAIN[input.site];
    const url = `https://${domain}/dp/${asin}`;
    ctx.logger.info(
      `get_amazon_product: asin=${asin} site=${input.site} url=${url}`,
    );
    // parserName is honored only when format=json; always pair them so
    // the response is never empty.
    return ctx.client.post("/api/v1/scrape", {
      url,
      parserName: "amzProductDetail",
      format: "json",
      timeout: 60000,
      ...(input.zipcode ? { bizContext: { zipcode: input.zipcode } } : {}),
    });
  },
};
