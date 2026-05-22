/**
 * Pangolinfo MCP - tool: get_amazon_reviews
 *
 * Wraps POST /api/v1/scrape (parserName=amzReviewV2) — the Amazon
 * Review API.
 *
 * Verified 2026-05-19 against scrapeapi prod with ASIN B09B8V1LZ3:
 *   - Synchronous response (no callback needed)
 *   - data.json[0].data.results[] — each review with
 *     { reviewId, date, country, star, author, authorId, authorLink,
 *       title, content, imgs, videos, purchased, vineVoice, helpful,
 *       attributes }
 *   - Pricing: 10 points × pageCount (observed 5 for pageCount=1 on
 *     a partial-result; budget for 10/page)
 *   - Avg latency: ~10s
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const SITE_TO_DOMAIN: Record<string, string> = {
  amz_us: "www.amazon.com",
  amz_uk: "www.amazon.co.uk",
  amz_de: "www.amazon.de",
  amz_jp: "www.amazon.co.jp",
};

const inputSchema = z.object({
  asin: z
    .string()
    .regex(/^[A-Z0-9]{10}$/, "ASIN must be 10 uppercase letters/digits")
    .describe(
      t({
        zh: "Amazon ASIN（10 位大写字母+数字）。Examples: 'B09B8V1LZ3' / 'B0CRMZHDG8'。",
        en: "Amazon ASIN (10-char uppercase alphanumeric). Examples: 'B09B8V1LZ3' / 'B0CRMZHDG8'.",
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
  pageCount: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(1)
    .describe(
      t({
        zh: "拉取的评论页数（1 页约 10 条评论）。**每页扣 10 积点**，请按需控制。默认 1 页。",
        en: "Number of review pages to fetch (~10 reviews per page). **Costs 10 points per page** — control accordingly. Defaults to 1.",
      }),
    ),
  filterByStar: z
    .enum([
      "all_stars",
      "five_star",
      "four_star",
      "three_star",
      "two_star",
      "one_star",
      "positive",
      "critical",
    ])
    .default("all_stars")
    .describe(
      t({
        zh: "按星级筛选。VOC 痛点挖掘建议传 'critical'（1-3 星差评），找改进点；正面卖点提取传 'positive'。",
        en: "Filter by star rating. For VOC pain-point mining, pass 'critical' (1-3 star reviews) to surface defects; for positive-aspect extraction, pass 'positive'.",
      }),
    ),
  sortBy: z
    .enum(["recent", "helpful"])
    .default("recent")
    .describe(
      t({
        zh: "排序：'recent' 按时间倒序（看最新口碑），'helpful' 按帮助票数（看影响力大的评论）。",
        en: "Sort order: 'recent' (newest first — track current sentiment) or 'helpful' (most-upvoted first — highest impact reviews).",
      }),
    ),
  mediaType: z
    .enum(["all_contents", "media_reviews_only"])
    .default("all_contents")
    .describe(
      t({
        zh: "评论类型：'all_contents' 全部评论，'media_reviews_only' 仅含图片/视频的评论（更真实可信）。",
        en: "Review type: 'all_contents' for all, 'media_reviews_only' for reviews with photos/videos only (higher credibility).",
      }),
    ),
  zipcode: z
    .string()
    .optional()
    .describe(
      t({
        zh: "邮编（如 '10041'）。可选。",
        en: "ZIP code (e.g. '10041'). Optional.",
      }),
    ),
});

export const getAmazonReviews: Tool<typeof inputSchema> = {
  name: "get_amazon_reviews",
  description: t({
    zh: `[Amazon 评论批量抓取] 翻页拉某 ASIN 的真实买家评论。可按星级/排序/媒体类型过滤。
Use when: 用户说"看一下 X 的差评""挖痛点""分析竞品评论""做 VOC""为 Listing 找用户原声"；或新品立项前差评扫描；或 listing 优化要找改进点。
Don't use: 只看 PDP 自带的几条评论摘要（用 get_amazon_product，里面已含 5-10 条 reviews 和 aiReviewsSummary，对快速判断已经够）；做关键词搜索（用 search_amazon）。
Returns: data.json[0].data.results[{ reviewId, date, country, star, title, content, author, authorId, authorLink, imgs[], videos, purchased, vineVoice, helpful, attributes }] — 1 页约 10 条评论。
Pair with: ↑ asin 常来自 search_amazon / get_amazon_product / list_bestsellers；↓ 评论文本可直接给 LLM 做痛点聚类、关键词提取。
Cost: **10 积点/页**（贵）。建议先 pageCount=1 探一下，确认有数据再 pageCount=3~5 扩量。filterByStar='critical' 优先（差评信号密度最高）。
Tips: filterByStar 取值 = all_stars / five_star ... one_star / positive / critical；sortBy = recent (默认) | helpful；mediaType = all_contents (默认) | media_reviews_only (带图带视频，真实度更高)。`,
    en: `[Amazon review batch scrape] Page-fetch real buyer reviews for an ASIN. Filterable by star / sort / media type.
Use when: user says "look at X's negative reviews" / "mine pain points" / "analyse competitor reviews" / "do VOC" / "find user complaints for Listing copy"; or pre-launch critical-review scan; or finding improvement points for listing optimization.
Don't use: when the few reviews already in the PDP would suffice (get_amazon_product carries 5-10 reviews + aiReviewsSummary — enough for a quick read); for keyword search (use search_amazon).
Returns: data.json[0].data.results[{ reviewId, date, country, star, title, content, author, authorId, authorLink, imgs[], videos, purchased, vineVoice, helpful, attributes }] — ~10 reviews per page.
Pair with: ↑ asin typically from search_amazon / get_amazon_product / list_bestsellers; ↓ review text can be fed directly to an LLM for pain-point clustering and keyword extraction.
Cost: **10 points per page** (expensive). Start with pageCount=1 to confirm data, scale to 3-5 only when needed. Prefer filterByStar='critical' — highest signal density.
Tips: filterByStar = all_stars / five_star ... one_star / positive / critical; sortBy = recent (default) | helpful; mediaType = all_contents (default) | media_reviews_only (with photos/videos, higher credibility).`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const domain = SITE_TO_DOMAIN[input.site];
    const url = `https://${domain}`;
    ctx.logger.info(
      `get_amazon_reviews: asin=${input.asin} site=${input.site} pageCount=${input.pageCount} filter=${input.filterByStar} sort=${input.sortBy} mediaType=${input.mediaType}`,
    );
    return ctx.client.post("/api/v1/scrape", {
      url,
      site: "",
      bizContext: {
        bizKey: "review",
        pageCount: input.pageCount,
        asin: input.asin,
        filterByStar: input.filterByStar,
        sortBy: input.sortBy,
        ...(input.zipcode ? { zipcode: input.zipcode } : {}),
      },
      format: "json",
      formatType: "all_formats",
      mediaType: input.mediaType,
      parserName: "amzReviewV2",
    });
  },
};
