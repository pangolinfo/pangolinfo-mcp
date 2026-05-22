/**
 * Pangolinfo MCP - tool: list_seller_products
 *
 * Wraps POST /api/v1/scrape with parserName=amzProductOfSeller.
 *
 * Verified 2026-05-19 (seller=ATVPDKIKX0DER, Amazon.com first-party):
 * returns `data.json[0].data.results[]` — each row with
 * `{ asin, title, price, star, rating, rank, img }` + pagination
 * `{ pageIndex, maxPage, nextPage }`. pointCost=1.0
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  sellerId: z
    .string()
    .min(1)
    .describe(
      t({
        zh: "Amazon 卖家 ID（merchant ID，14 位字母数字）。Examples: 'ATVPDKIKX0DER'（Amazon 自营）/ 'A2L77EE7U53NWQ'（Amazon Warehouse）。从商品页 'sold by' 链接或 amazon.com/sp?seller=... URL 里读取。",
        en: "Amazon merchant ID (14-char alphanumeric). Examples: 'ATVPDKIKX0DER' (Amazon.com first-party) / 'A2L77EE7U53NWQ' (Amazon Warehouse). Find it in a product page's 'sold by' link or amazon.com/sp?seller=... URL.",
      }),
    ),
  site: z
    .enum(["amz_us", "amz_uk", "amz_de", "amz_jp"])
    .default("amz_us")
    .describe(
      t({
        zh: "Amazon 站点。默认 amz_us。",
        en: "Amazon marketplace. Defaults to amz_us.",
      }),
    ),
  zipcode: z
    .string()
    .optional()
    .describe(
      t({
        zh: "邮编（如 '10041'）。可选；未填后端按站点取默认值。",
        en: "ZIP code (e.g. '10041'). Optional — backend falls back to a per-site default.",
      }),
    ),
  format: z
    .enum(["json", "markdown"])
    .default("json")
    .describe(
      t({
        zh: "返回格式。默认 'json'——结构化卖家商品列表。需要原始页面阅读时切 'markdown'。",
        en: "Response format. Defaults to 'json' — structured seller listings. Use 'markdown' for the rendered page text.",
      }),
    ),
});

export const listSellerProducts: Tool<typeof inputSchema> = {
  name: "list_seller_products",
  description: t({
    zh: `[Amazon 卖家店铺铺货] 列出某 merchant ID 名下的全部上架商品，分页（每页 24 条）。
Use when: 用户说"看一下这个卖家有哪些产品""X 店铺铺了多少 SKU""竞品店铺品类宽度""跟卖卖家在卖什么""店铺铺货策略调研"。
Don't use: 不知道 merchant ID 时（先去某商品 PDP 里找 'sold by' 链接拿 ID）；只看单品（用 get_amazon_product）。
Returns: data.json[0].data.{ pageIndex, maxPage, nextPage, results[{ asin, title, price, star, rating, rank, img }] } —— 每页 24 条。
Pair with: ↑ sellerId 通常从 get_amazon_product 的 seller.id 字段拿到，或用户从 amazon.com/sp?seller=... URL 里读到；↓ 把 asin 喂 get_amazon_product 拆主推品。
Cost: ~1 积点/次, ~5s。
Tips: 跟卖矩阵分析建议翻 2-3 页看真实 SKU 数（很多店铺有 100+ 商品）。Amazon 自营 sellerId = 'ATVPDKIKX0DER'。`,
    en: `[Amazon seller storefront] List all listings under a merchant ID, paginated (24 rows/page).
Use when: user says "show me this seller's products" / "how many SKUs does store X carry" / "competitor storefront category breadth" / "what is this seller pushing" / "research a seller's catalog strategy".
Don't use: without a merchant ID (find 'sold by' link on any product PDP first); for a single product (use get_amazon_product).
Returns: data.json[0].data.{ pageIndex, maxPage, nextPage, results[{ asin, title, price, star, rating, rank, img }] } — 24 rows/page.
Pair with: ↑ sellerId usually from get_amazon_product's seller.id field, or from amazon.com/sp?seller=... URL; ↓ feed asin into get_amazon_product to deep-dive hero products.
Cost: ~1 point/call, ~5s.
Tips: for storefront breadth analysis, paginate 2-3 pages to see real SKU count (many stores have 100+). Amazon first-party sellerId = 'ATVPDKIKX0DER'.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(
      `list_seller_products: sellerId=${input.sellerId} site=${input.site} format=${input.format}`,
    );
    return ctx.client.post("/api/v1/scrape", {
      site: input.site,
      content: input.sellerId,
      parserName: "amzProductOfSeller",
      format: input.format,
      timeout: 60000,
      ...(input.zipcode ? { bizContext: { zipcode: input.zipcode } } : {}),
    });
  },
};
