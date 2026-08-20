/**
 * Pangolinfo MCP - tool: get_amazon_product
 *
 * Per CONTRACT.md §2 / §8 — fetch full product detail for a single ASIN
 * via POST /api/v1/scrape.
 *
 * Backend dispatch (verified 2026-05-19 against scrapeapi prod):
 *   - `format` selects the output shape (`json` | `markdown` | `rawHtml`).
 *   - For `format=json` the backend routes the raw HTML through a gRPC
 *     parser keyed by `parserName`. For PDP pages that parser is
 *     `amzProductDetail` — returns a structured `{results:[{title, seller,
 *     rating, ratingDistribution, galleryThumbnails, aiReviewsSummary, ...}]}`
 *     payload (pointCost=1.0).
 *   - For `format=markdown` / `rawHtml` the backend skips parsing and
 *     emits the body straight (pointCost=0.75); `parserName` is ignored.
 *
 *   So `format=json` ALONE returns empty (`data.json: []`) because no
 *   parser is wired in — we must always pair it with `parserName`.
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
  format: z
    .enum(["json", "markdown"])
    .default("json")
    .describe(
      t({
        zh: "返回格式。默认 'json'——结构化字段（title/price/rating/reviews/seller 等），适合程序处理。需要原始页面阅读时切 'markdown'。",
        en: "Response format. Defaults to 'json' — a structured payload (title, price, rating, reviews, seller, etc.) ready for programmatic use. Use 'markdown' if you want the rendered PDP text instead.",
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
Returns (format='json', 默认): data.json[0].data.results[0] = { asin, title, itemName, itemHighlights, price, star, rating, brand, seller{name,id}, parentAsin, shippingFee（买家配送料数字，如 "750"；免运费/无信息为 "0"，随 zipcode 对应地址变化）, delivery{deliveryTime,fastestDelivery}, ratingDistribution[], aiReviewsSummary, bestSellersRankItems, reviews[{date,star,content,helpful,...}], productOverview[], features[], productDescription[], images[], variantDetails[], attributes[], category_id, breadCrumbs, ... } — 30+ 字段（含 variantDetails 简表）。需要高退货提示、免运费/付费/最快配送细分和备货时长时，改用 get_amazon_delivery_time。
标题字段说明（Amazon 2026-07-27 起把标题拆成两段）：title=完整标题原串（已 rollout 的商品含 " | " 分隔，未拆）；itemName=标题主体（"| " 前段，即商品名称，≤75 字符）；itemHighlights=标题亮点（"| " 后段，材质/用途/卖点等，≤125 字符）。未 rollout 的老商品 itemName=完整标题、itemHighlights 为空串。要展示纯商品名用 itemName，要卖点用 itemHighlights。
Pair with: ↑ asin 常来自 search_amazon / list_bestsellers / filter_niches；↓ 同一 asin 喂 get_amazon_reviews 取更多评论（默认 PDP 只带 5-10 条 reviews）。
Cost: ~1 积点/次, ~5s。`,
    en: `[Amazon single-product detail] Scrape the full PDP for one ASIN.
Use when: user supplies a specific ASIN ("look at B0XXXXXXXX" / "check this product's price/rating/seller" / "analyse this competitor"); or as a SOP step after candidate ASINs are picked.
Don't use: for many products at once (use search_amazon or list_* series for lists); for reviews only (use get_amazon_reviews — cheaper and more focused).
Returns (format='json', default): data.json[0].data.results[0] = { asin, title, itemName, itemHighlights, price, star, rating, brand, seller{name,id}, parentAsin, shippingFee (buyer shipping fee as a number, e.g. "750"; "0" when free shipping or no info, varies by the zipcode address), delivery{deliveryTime,fastestDelivery}, ratingDistribution[], aiReviewsSummary, bestSellersRankItems, reviews[{date,star,content,helpful,...}], productOverview[], features[], productDescription[], images[], variantDetails[], attributes[], category_id, breadCrumbs, ... } — 30+ fields (variantDetails summary included). Use get_amazon_delivery_time when you need the high-return warning, free/paid/fastest delivery breakdown, or handling lead time.
Title fields (Amazon split the title into two parts starting 2026-07-27): title=the full raw title string (for rolled-out listings it contains a " | " separator, unsplit); itemName=the title body (the part before " | ", i.e. the product name, ≤75 chars); itemHighlights=the title highlights (the part after " | ", e.g. material/use-case/selling points, ≤125 chars). For legacy (not-yet-rolled-out) listings itemName=the full title and itemHighlights is an empty string. Use itemName for the clean product name, itemHighlights for selling points.
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
      `get_amazon_product: asin=${asin} site=${input.site} format=${input.format} url=${url}`,
    );
    // `parserName` is only honored by the backend when `format=json`;
    // sending it for markdown is harmless but unnecessary. Always pair
    // them so json never returns empty.
    return ctx.client.post("/api/v1/scrape", {
      url,
      parserName: "amzProductDetail",
      format: input.format,
      timeout: 60000,
      ...(input.zipcode ? { bizContext: { zipcode: input.zipcode } } : {}),
    });
  },
};
