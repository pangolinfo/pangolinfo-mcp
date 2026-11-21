import { z } from "zod";
import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

export const ECOMMERCE_PLATFORMS = ["walmart", "costco", "bestbuy", "samsclub", "target", "naver", "tiktok"] as const;

// Page-size limits enforced by the collection API per storefront; sending an
// out-of-range value only wastes a call and comes back as parameter error 1002.
function pageSizeBounds(platform: (typeof ECOMMERCE_PLATFORMS)[number], country?: string): [number, number] {
  switch (platform) {
    case "walmart": return country === undefined || country === "CA" ? [1, 100] : [10, 10];
    case "samsclub": return [10, 10];
    case "tiktok": return [5, 5];
    case "bestbuy": return country === "CA" ? [1, 100] : [1, 20];
    case "target": return [1, 50];
    case "naver": return [1, 30];
    default: return [1, 100];
  }
}

const inputSchema = z.object({
  platform: z.enum(ECOMMERCE_PLATFORMS),
  operation: z.enum(["reviews", "product-detail"]).default("reviews").describe(t({zh:"Product包含商品详情和评分汇总；Reviews获取评论。",en:"Product combines product details and aggregate ratings; Reviews returns buyer reviews."})),
  country: z.string().regex(/^[A-Za-z]{2}$/).optional().describe(t({zh:"Walmart/Costco/Best Buy必填站点国家码。Sam's Club/Target/TikTok Shop默认US，Naver Shopping默认KR，无需填写固定国家。",en:"Required storefront country for Walmart/Costco/Best Buy. Omit for Sam's Club/Target/TikTok Shop (US) and Naver Shopping (KR)."})),
  productId: z.string().min(1).max(24).optional().describe(t({zh:"商品ID，与productUrl至少填写一项。",en:"Product ID; supply this or productUrl."})),
  productUrl: z.string().url().max(2048).optional().describe(t({zh:"完整商品链接，与productId至少填写一项。",en:"Full product URL; supply this or productId."})),
  page: z.number().int().min(1).max(300001).optional().describe(t({zh:"仅Reviews分页；TikTok Shop固定首批，无需传入。",en:"Reviews page only; omit for TikTok Shop's fixed first batch."})),
  pageSize: z.number().int().min(1).max(100).optional().describe(t({zh:"仅支持可变每页数量的平台Reviews；每页上限：Walmart 美国站固定10、加拿大站100，Sam's Club 固定10，TikTok Shop 固定5，Best Buy 美国站20/加拿大站100，Target 50，Naver Shopping 30，Costco 100；省略按站点默认。",en:"Reviews page size where supported. Limits: Walmart US fixed 10 / CA 100, Sam's Club fixed 10, TikTok Shop fixed 5, Best Buy US 20 / CA 100, Target 50, Naver Shopping 30, Costco 100; omit to use the storefront default."})),
  includeNative: z.boolean().optional().describe(t({zh:"是否附带上游原生数据；默认false。原生块会使响应体积约为3倍，开启时pageSize不得超过20。",en:"Include native upstream data; defaults to false. Native blocks make responses roughly 3x larger, so pageSize must not exceed 20 when this is on."})),
  refresh: z.boolean().optional().describe(t({zh:"请求刷新现有缓存。",en:"Request a refresh of cached data."})),
  allowStale: z.boolean().optional().describe(t({zh:"仅Reviews：是否允许使用过期缓存。",en:"Reviews only: allow stale cached data."})),
  originProductId: z.string().optional().describe(t({zh:"仅Naver Shopping：可选原商品ID映射。",en:"Naver Shopping only: optional origin-product mapping."})),
  merchantId: z.string().optional().describe(t({zh:"仅Naver Shopping：可选商家ID映射。",en:"Naver Shopping only: optional merchant mapping."})),
  storeSlug: z.string().optional().describe(t({zh:"仅Naver Shopping：可选店铺标识映射。",en:"Naver Shopping only: optional storefront mapping."})),
}).strict().superRefine((input, ctx) => {
  if (["walmart", "costco", "bestbuy"].includes(input.platform) && !input.country)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"country is required for this platform",path:["country"]});
  const fixedCountry = input.platform === "naver" ? "KR" : ["samsclub", "target", "tiktok"].includes(input.platform) ? "US" : undefined;
  if (fixedCountry && input.country && input.country.toUpperCase() !== fixedCountry)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:`This platform uses country=${fixedCountry}`,path:["country"]});
  if (input.platform !== "naver") for (const field of ["originProductId", "merchantId", "storeSlug"] as const)
    if (input[field] !== undefined) ctx.addIssue({code:z.ZodIssueCode.custom,message:`${field} is only supported for Naver Shopping`,path:[field]});
  if (input.operation === "product-detail") {
    for (const field of ["page", "pageSize", "allowStale"] as const)
      if (input[field] !== undefined) ctx.addIssue({code:z.ZodIssueCode.custom,message:`${field} is not supported for Product`,path:[field]});
  }
  if (!input.productId && !input.productUrl) ctx.addIssue({code:z.ZodIssueCode.custom,message:"productId or productUrl is required",path:["productId"]});
  // Native upstream blocks are copied through verbatim and multiply the
  // payload ~3x. At pageSize=100 that lands around a quarter-megabyte of
  // JSON in one tool result, which floods the caller's context.
  if (input.includeNative && input.pageSize !== undefined && input.pageSize > 20)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"pageSize must be <= 20 when includeNative is true",path:["pageSize"]});
  if (input.platform === "tiktok" && ((input.page !== undefined && input.page !== 1) || (input.pageSize !== undefined && input.pageSize !== 5)))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"TikTok uses page=1, pageSize=5 and no sort",path:["platform"]});
  if (input.platform !== "tiktok" && input.operation === "reviews" && input.pageSize !== undefined) {
    const country = input.country?.toUpperCase() ?? (input.platform === "naver" ? "KR" : undefined);
    const [min, max] = pageSizeBounds(input.platform, country);
    if (input.pageSize < min || input.pageSize > max)
      ctx.addIssue({code:z.ZodIssueCode.custom,
        message: min === max
          ? `pageSize is fixed at ${min} for ${input.platform}${country ? " " + country : ""}`
          : `pageSize must be between ${min} and ${max} for ${input.platform}${country ? " " + country : ""}`,
        path:["pageSize"]});
  }
});

export const collectEcommerceData: Tool<typeof inputSchema> = {
  name: "collect_ecommerce_data",
  description: t({
    zh: "Walmart、Costco、Best Buy、Sam's Club、Target、Naver Shopping、TikTok Shop 支持 Product（operation=product-detail）：data.product 返回标题、价格、图片、规格和变体，data.productSummary 保留评分汇总，合计0.8积点/商品。Reviews返回data.results，评论字段与分页不变，按唯一评论每条0.8积点。上游明确确认ID/URL无效或商品不存在，每次仍扣0.8积点；本地参数错误、超时、服务故障和合法空评论免费。",
    en: "Product (operation=product-detail) supports Walmart, Costco, Best Buy, Sam's Club, Target, Naver Shopping and TikTok Shop: data.product contains title, price, images, specifications and variants; data.productSummary retains aggregate ratings. The combined product costs 0.8 points. Reviews retain data.results and pagination, at 0.8 points per unique returned review. Confirmed invalid IDs/URLs or missing products cost 0.8 points; local validation errors, timeouts, service failures and valid empty reviews are free.",
  }),
  inputSchema,
  async execute(input, ctx) {
    const { platform, operation, ...body } = input;
    ctx.logger.info(`collect_ecommerce_data: platform=${platform} operation=${operation}`);
    const country = body.country?.toUpperCase() ?? (platform === "naver" ? "KR" : "US");
    return ctx.client.post(`/api/v1/ecommerce/${platform}/${operation}`, { ...body, country }, 90000);
  },
};
