import { z } from "zod";
import type { Tool } from "./_types.js";
import { t } from "../i18n.js";
import { PangolinfoError } from "../errors.js";

// Four sequential upstream steps can retry. This is a local wait budget,
// not an upper bound on backend work; gateways may close the connection sooner.
const PROFIT_DEADLINE_MS = 180_000;

const inputSchema = z.object({
  asin: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/).describe(t({
    zh: "商品 ASIN，10位字母或数字，例如 B07FZ8S74R。", en: "Ten-character product ASIN, e.g. B07FZ8S74R.",
  })),
  country: z.preprocess(value => typeof value === "string" ? value.toUpperCase() : value, z.enum(["US", "JP"])).describe(t({
    zh: "Amazon 站点国家：US 或 JP，不区分大小写。", en: "Amazon marketplace country: US or JP, case-insensitive.",
  })),
  fbaPrice: z.number().nonnegative().optional().describe(t({zh: "FBA 售价；不传使用商品当前价。", en: "FBA selling price; defaults to the current product price."})),
  mfnPrice: z.number().nonnegative().optional().describe(t({zh: "自配送售价；不传使用商品当前价。", en: "Merchant-fulfilled selling price; defaults to the current product price."})),
  mfnShippingPrice: z.number().nonnegative().optional().describe(t({zh: "自配送时买家承担的运费；不传为0。", en: "Buyer-paid shipping for merchant fulfillment; defaults to zero."})),
  packageLength: z.number().positive().optional().describe(t({zh: "包装长度；不传使用商品尺寸。", en: "Package length; defaults to product dimensions."})),
  packageWidth: z.number().positive().optional().describe(t({zh: "包装宽度；不传使用商品尺寸。", en: "Package width; defaults to product dimensions."})),
  packageHeight: z.number().positive().optional().describe(t({zh: "包装高度；不传使用商品尺寸。", en: "Package height; defaults to product dimensions."})),
  dimensionUnit: z.enum(["inches", "centimeters"]).optional().describe(t({zh: "尺寸单位；不传时US为inches，JP为centimeters。", en: "Dimension unit; defaults to inches in US and centimeters in JP."})),
  packageWeight: z.number().positive().optional().describe(t({zh: "包装重量；不传使用商品重量。", en: "Package weight; defaults to product weight."})),
  weightUnit: z.enum(["pounds", "kilograms"]).optional().describe(t({zh: "重量单位；不传时US为pounds，JP为kilograms。", en: "Weight unit; defaults to pounds in US and kilograms in JP."})),
  programs: z.array(z.enum(["FBA", "MFN"])).min(1).max(2).optional().describe(t({zh: "配送方案：FBA、MFN；不传同时计算两者。", en: "Fulfillment programs: FBA and/or MFN; defaults to calculating both."})),
}).strict();

export const calculateAmazonProfit: Tool<typeof inputSchema> = {
  name: "calculate_amazon_profit",
  description: t({
    zh: "计算 Amazon 美国/日本站商品的 FBA 与自配送费用、利润及利润率。输入 ASIN 和 country，可调整售价、运费、包装尺寸/重量及配送方案。返回 data.summary（FBA/MFN费用与利润）、data.product 和 data.raw。默认价格和包装数据由后端获取。每次成功调用固定5积点，响应不含 pointCost，字段缺失不代表免费。同步返回，MCP等待预算180秒；超时或连接中断时完成及扣费状态未知，不要自动重试。8000表示商品未找到、未计费，请核对ASIN与站点。适合选品成本核算和配送方案比较；商品详情使用 get_amazon_product。",
    en: "Calculate Amazon US/JP FBA and merchant-fulfilled fees, profit and profit margin. Supply asin and country; optionally override prices, shipping, package dimensions/weight and fulfillment programs. Returns data.summary (FBA/MFN costs and profit), data.product and data.raw. The backend supplies omitted prices and package data. A successful call costs a fixed 5 points; the response has no pointCost field, and its absence does not mean free. Returns synchronously with a 180-second MCP wait budget. On timeout or connection loss, completion and billing are unknown: do not automatically retry. Code 8000 means product not found, unbilled; check ASIN and marketplace. Use for product economics and fulfillment comparisons; use get_amazon_product for listing details.",
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(`calculate_amazon_profit: asin=${input.asin} country=${input.country}`);
    try {
      return await ctx.client.post("/api/v1/revenue-calculator", input, { deadlineMs: PROFIT_DEADLINE_MS });
    } catch (error) {
      // A transport/gateway failure does not establish that backend work was
      // cancelled. Preserve evidence without telling agents to submit twice.
      if (error instanceof PangolinfoError && (error.code === "NETWORK" || (error.code === "SERVER" && error.httpStatus >= 500))) {
        throw new PangolinfoError("OUTCOME_UNKNOWN", error.httpStatus, t({
          zh: "利润计算未收到完整结果，完成及扣费状态未知。",
          en: "Profit calculation returned no complete result; completion and billing are unknown.",
        }), { causeCode: error.code, causeMessage: error.message, upstream: error.details });
      }
      throw error;
    }
  },
};
