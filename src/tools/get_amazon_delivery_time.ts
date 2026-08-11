/**
 * Pangolinfo MCP - tool: get_amazon_delivery_time
 *
 * Uses the standard scrape endpoint with parserName=amzDeliveryTime.
 * The dedicated parser keeps the extra fields out of the standard
 * get_amazon_product response and is billed at 2 points.
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
        zh: "Amazon ASIN，10 位字母/数字（大小写均可，会自动转大写）。",
        en: "Amazon ASIN, 10 letters/digits (case-insensitive; auto-uppercased).",
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
        zh: "Amazon 站点，默认 amz_us。",
        en: "Amazon marketplace. Defaults to amz_us.",
      }),
    ),
  zipcode: z
    .string()
    .optional()
    .describe(
      t({
        zh: "与站点国家匹配的邮编。配送时效会随收货地址变化；不传时后端从该国家邮编池随机选择。",
        en: "ZIP code matching the marketplace country. Delivery estimates vary by address; the backend selects a country-matched ZIP when omitted.",
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

export const getAmazonDeliveryTime: Tool<typeof inputSchema> = {
  name: "get_amazon_delivery_time",
  description: t({
    zh: `[Amazon Delivery Time] 按 ASIN 返回完整商品详情，并追加地址相关的配送时效字段。
Use when: 用户明确要查预计送达时间、免运费/付费配送时间、最快配送、备货周期，或页面是否展示高退货提示。
Don't use: 只查常规商品详情时用 get_amazon_product，成本更低（1 积点）。
Returns: data.json[0].data.results[0] 继承 get_amazon_product 的全部字段，并追加 frequentlyReturnedItem、leadTime，以及 delivery{deliveryTime,fastestDelivery,deliveryTimeFree,deliveryTimePay,deliveryFastest}。空缺字段返回空字符串。
Cost: 2 积点/次，约 5 秒。配送结果与 zipcode 对应地址相关。`,
    en: `[Amazon Delivery Time] Return the full listing detail for one ASIN plus address-dependent delivery estimates.
Use when: the user explicitly needs estimated arrival, free vs paid delivery timing, the fastest option, handling lead time, or the listing's high-return warning.
Don't use: for ordinary product detail only; use get_amazon_product at the lower 1-point cost.
Returns: data.json[0].data.results[0] inherits every get_amazon_product field and adds frequentlyReturnedItem, leadTime, and delivery{deliveryTime,fastestDelivery,deliveryTimeFree,deliveryTimePay,deliveryFastest}. Unavailable extra fields are empty strings.
Cost: 2 points/call, ~5s. Delivery results depend on the zipcode address.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const asin = input.asin.toUpperCase();
    const domain = SITE_TO_DOMAIN[input.site];
    const url = `https://${domain}/dp/${asin}`;
    ctx.logger.info(
      `get_amazon_delivery_time: asin=${asin} site=${input.site} url=${url}`,
    );
    return ctx.client.post("/api/v1/scrape", {
      url,
      parserName: "amzDeliveryTime",
      format: "json",
      timeout: 60000,
      ...(input.zipcode ? { bizContext: { zipcode: input.zipcode } } : {}),
    });
  },
};
