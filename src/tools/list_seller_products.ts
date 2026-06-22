/**
 * Pangolinfo MCP - tool: list_seller_products
 *
 * Wraps POST /api/v1/scrape with parserName=amzProductOfSeller.
 *
 * Verified 2026-05-19 (seller=ATVPDKIKX0DER, Amazon.com first-party):
 * returns `data.json[0].data.results[]` — each row with
 * `{ asin, title, price, star, rating, rank, img }` + pagination
 * `{ pageIndex, maxPage, nextPage }`. pointCost=1.0
 *
 * 2026-06: backend added two amzProductOfSeller-only top-level params —
 * `pageCount` (accumulate first N pages in one call, cap 3, billed per
 * successful page) and `categoryId` (filter the storefront by category,
 * single or comma-separated multi-level; backend builds the rh param).
 * page vs pageCount: page views one page; pageCount>1 accumulates from
 * page 1 and ignores `page`.
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
    .enum(["amz_us", "amz_uk", "amz_de", "amz_jp", "amz_fr", "amz_it", "amz_es", "amz_ca", "amz_au", "amz_sa", "amz_ae", "amz_br", "amz_mx"])
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
        zh: "邮编，必须匹配 site 站点所在国家（amz_us → 美国邮编，amz_jp → 日本邮编 …）。可选；不传时后端会从对应国家邮编池随机挑一个。跨国邮编（如 amz_us + 日本邮编）会被后端拒绝。Examples: 10001 (NY) / 90001 (LA) / 100-0001 (Tokyo).",
        en: "ZIP code that must match the site country (amz_us → US zip, amz_jp → JP zip, ...). Optional; backend picks a random one from the per-country pool when omitted. Cross-country zips (e.g. amz_us + JP zip) are rejected by the backend. Examples: 10001 (NY) / 90001 (LA) / 100-0001 (Tokyo).",
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
  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      t({
        zh: "页码，从 1 开始。每页 24 条。结合响应里的 pageIndex/maxPage/nextPage 决定是否继续：nextPage 为下一页页码，nextPage=null 或 page>=maxPage 表示到底。**只在用户明确要更多/全部 SKU 时才翻**，否则首页够用。注意：传了 pageCount>1（多页累计）时，page 被忽略（后端固定从第 1 页开始累计）。",
        en: "Page number, 1-based. 24 rows per page. Use response's pageIndex/maxPage/nextPage to decide whether to continue: nextPage holds the next page number; nextPage=null or page>=maxPage means last page reached. **Only paginate when the user explicitly asks for more / all SKUs** — otherwise the first page is enough. NOTE: when pageCount>1 (multi-page accumulate) is set, page is ignored (the backend always accumulates from page 1).",
      }),
    ),
  pageCount: z
    .number()
    .int()
    .min(1)
    .max(3)
    .default(1)
    .describe(
      t({
        zh: "多页累计爬取：传 N 则一次连续爬取前 N 页并扁平合并返回（如 3 = 第 1+2+3 页全部商品）。默认 1（单页，走 page 逻辑）；上限 3，超过按 3 处理。与 page 的区别：page 是定位看某一页，pageCount 是一次拉前 N 页合并。**只在需要一次性拿多页全量 SKU 时用**；按实际成功页数计费（某页失败退该页费用）。",
        en: "Multi-page accumulate: passing N crawls the first N pages in one call and returns them flat-merged (e.g. 3 = all products from pages 1+2+3). Default 1 (single page, uses the `page` flow); cap 3, larger values treated as 3. Difference vs `page`: `page` locates one specific page, `pageCount` pulls the first N pages merged. **Use only when you need the full multi-page SKU set in one shot.** Billed by pages actually crawled (a failed page is refunded).",
      }),
    ),
  categoryId: z
    .string()
    .optional()
    .describe(
      t({
        zh: "类目筛选 ID，按该类目过滤店铺商品。单个最小类目 ID（如 '7161074011'），或逗号分隔的多级类目（如 '172282,502394,7161073011'）。不填 = 返回店铺全部商品。可从 Amazon 店铺页 URL 的 rh=n:<类目ID> 中提取。",
        en: "Category filter ID — filters the seller's products by category. A single leaf category ID (e.g. '7161074011'), or comma-separated multi-level categories (e.g. '172282,502394,7161073011'). Omit = all products of the seller. Extractable from the rh=n:<categoryId> part of an Amazon storefront URL.",
      }),
    ),
});

export const listSellerProducts: Tool<typeof inputSchema> = {
  name: "list_seller_products",
  description: t({
    zh: `[Amazon 卖家店铺铺货] 列出某 merchant ID 名下的全部上架商品，分页（每页 24 条）。
Use when: 用户说"看一下这个卖家有哪些产品""X 店铺铺了多少 SKU""竞品店铺品类宽度""跟卖卖家在卖什么""店铺铺货策略调研"。
Don't use: 不知道 merchant ID 时（先去某商品 PDP 里找 'sold by' 链接拿 ID）；只看单品（用 get_amazon_product）。
Returns: data.json[0].data.{ pageIndex, maxPage, nextPage, results[{ asin, title, price, star, rating, rank, img }] } —— 每页 24 条。**每行自带 rank**（店铺页上的展示顺序，约等于该卖家店内热度排序）+ star/rating，**单凭这一次调用就能给店铺在售品排序、出表，无需逐个再打 PDP**。**翻页两种方式**: ① page 定位看某一页（默认 1）；② pageCount 一次累计前 N 页合并（N≤3，结果扁平进同一 results）。pageCount>1 时 pageIndex/nextPage 等会置空（多页已合并）。**类目筛选**: categoryId 按类目过滤店铺商品。
Pair with: ↑ sellerId 通常从 get_amazon_product 的 seller.id 字段拿到，或用户从 amazon.com/sp?seller=... URL 里读到；categoryId 可从店铺页 rh=n:<id> 提取；↓ 把 asin 喂 get_amazon_product 拆主推品。
**串联避坑——"店铺有哪些品 + 按销量/排名排序"**: ❌ 不要"对店铺每个 ASIN 都跑一次 get_amazon_product 取小类 BSR 再排序" —— 店铺动辄几十上百 SKU，逐个打 PDP 会撞 2 QPS 速率墙、N 次扣费、远超 Fast 档预算。✅ 正确做法：**本 tool 一次（或 pageCount≤3）返回的 results[] 已带 rank，直接按 rank 升序就是店内排序，配合 star/rating 出表即可**。只有当用户明确要"全局小类 BSR 精确排名"时，才对**少量头部 ASIN（如前 5-10 个，按列表 rank 先筛）**单独跑 get_amazon_product 取 bestSellersRankItems[]，且分批 ≤2 并发——绝不全店逐个跑。
Cost: ~1 积点/页, ~5s；pageCount=N 按实际成功页数计费（失败页退费）。
Tips: 要一次性拿全量多页 SKU 用 pageCount（最多 3 页）；只看具体某一页用 page；单纯看一下店铺有什么货首页就够。排序优先用 results[].rank（免费、已含在本次返回里），别为排序去逐个抓 PDP。Amazon 自营 sellerId = 'ATVPDKIKX0DER'。`,
    en: `[Amazon seller storefront] List all listings under a merchant ID, paginated (24 rows/page).
Use when: user says "show me this seller's products" / "how many SKUs does store X carry" / "competitor storefront category breadth" / "what is this seller pushing" / "research a seller's catalog strategy".
Don't use: without a merchant ID (find 'sold by' link on any product PDP first); for a single product (use get_amazon_product).
Returns: data.json[0].data.{ pageIndex, maxPage, nextPage, results[{ asin, title, price, star, rating, rank, img }] } — 24 rows/page. **Every row carries rank** (its display order in the storefront, ≈ that seller's in-store popularity ranking) plus star/rating, so **this single call is enough to rank and tabulate the seller's listings — no need to re-fetch each PDP**. **Two pagination modes**: ① page locates a specific page (default 1); ② pageCount accumulates the first N pages in one call (N≤3, flat-merged into the same results). When pageCount>1, pageIndex/nextPage are blanked (pages already merged). **Category filter**: categoryId filters the seller's products by category.
Pair with: ↑ sellerId usually from get_amazon_product's seller.id field, or from amazon.com/sp?seller=... URL; categoryId extractable from the storefront URL's rh=n:<id>; ↓ feed asin into get_amazon_product to deep-dive hero products.
**Chaining pitfall — "what does this seller carry + sort by sales/rank"**: ❌ Do NOT "run get_amazon_product on every ASIN to pull each small-category BSR, then sort" — a storefront often has dozens-to-hundreds of SKUs; fanning out one PDP per ASIN hits the 2-QPS rate wall, bills N times, and blows the Fast-tier budget. ✅ Correct: **the results[] from one call (or pageCount≤3) already carry rank; sort by rank ascending for the in-store order and tabulate with star/rating**. Only when the user explicitly wants exact global small-category BSR should you run get_amazon_product on a **small head set (e.g. the top 5-10 pre-filtered by list rank)** to read bestSellersRankItems[], batched at ≤2 concurrent — never fan out across the whole store.
Cost: ~1 point/page, ~5s; pageCount=N billed by pages actually crawled (failed pages refunded).
Tips: use pageCount to grab the full multi-page SKU set in one shot (max 3 pages); use page to view one specific page; the first page is enough to glance at what the store sells. For sorting, prefer results[].rank (free, already in this response) — don't fan out PDP fetches just to sort. Amazon first-party sellerId = 'ATVPDKIKX0DER'.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const multiPage = input.pageCount > 1;
    // multiPage 时后端从第 1 页累计、忽略 content 里的 page，故 content 只传纯 sellerId。
    const content =
      !multiPage && input.page > 1
        ? `${input.sellerId}?page=${input.page}`
        : input.sellerId;
    ctx.logger.info(
      `list_seller_products: sellerId=${input.sellerId} site=${input.site} format=${input.format} page=${input.page} pageCount=${input.pageCount} categoryId=${input.categoryId ?? ""}`,
    );
    return ctx.client.post("/api/v1/scrape", {
      site: input.site,
      content,
      parserName: "amzProductOfSeller",
      format: input.format,
      timeout: 60000,
      ...(multiPage ? { pageCount: input.pageCount } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.zipcode ? { bizContext: { zipcode: input.zipcode } } : {}),
    });
  },
};
