/**
 * Pangolinfo MCP - tool: google_trends
 *
 * Wraps POST /api/v2/google/trends — Google Trends keyword popularity.
 *
 * Verified 2026-05-19 against scrapeapi prod with
 * { timeRange:"today 12-m", region:"US", keywords:["shoe","hat"],
 *   language:"en-US" } — returns geoMapData (per-state heatmap),
 * keywordsRankData (top related queries + breakout trends), and
 * timelineData (time series 0-100). 1.5 points/call, ~5s.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const TIME_RANGES = [
  "now 1-H",
  "now 4-H",
  "now 1-d",
  "now 7-d",
  "today 1-m",
  "today 3-m",
  "today 12-m",
  "today 5-y",
  "all",
] as const;

const inputSchema = z.object({
  keywords: z
    .array(z.string().min(1))
    .min(1)
    .max(5)
    .describe(
      t({
        zh: "对比的关键词列表（1-5 个）。Examples: ['wireless earbuds', 'bluetooth earbuds'] (同义词对比) / ['stanley quencher', 'yeti rambler', 'hydro flask'] (竞品品牌对比) / ['halloween costume'] (单词看季节性)。",
        en: "Keywords to compare (1-5). Examples: ['wireless earbuds', 'bluetooth earbuds'] (synonyms) / ['stanley quencher', 'yeti rambler', 'hydro flask'] (competing brands) / ['halloween costume'] (single keyword for seasonality).",
      }),
    ),
  timeRange: z
    .enum(TIME_RANGES)
    .default("today 12-m")
    .describe(
      t({
        zh: "时间窗口。常用：'today 12-m'（近 12 月，默认，平衡近况和趋势）、'today 3-m'（近 90 天）、'today 5-y'（5 年长期）、'all'（自 2004 起全部）。",
        en: "Time window. Common: 'today 12-m' (last 12 months, default), 'today 3-m' (last 90 days), 'today 5-y' (5-year long-term), 'all' (since 2004).",
      }),
    ),
  region: z
    .string()
    .default("US")
    .describe(
      t({
        zh: "地区代码（ISO 国家或 'WORLD' 全球）。常用：'US' / 'GB' / 'DE' / 'JP' / 'CN'。",
        en: "Region code (ISO country, or 'WORLD' for global). Common: 'US' / 'GB' / 'DE' / 'JP' / 'CN'.",
      }),
    ),
  language: z
    .string()
    .default("en-US")
    .describe(
      t({
        zh: "界面语言 BCP-47 代码，影响相关查询的语言。默认 'en-US'。中文用 'zh-CN'。",
        en: "Interface language (BCP-47), affects related-query language. Defaults to 'en-US'. Use 'zh-CN' for Chinese.",
      }),
    ),
});

export const googleTrends: Tool<typeof inputSchema> = {
  name: "google_trends",
  description: t({
    zh: `[Google Trends 关键词热度] 时间序列 + 地区热度 + 相关上升查询（含 Breakout 标记）。一次最多 5 个关键词同图对比。
Use when: 用户说"X 关键词最近热度怎么样""A 和 B 哪个更火""有没有季节性""哪些州最爱 X""breakout 上升词""新品方向判断""趋势对比""X 是不是已经过气了"。
Don't use: 想要绝对搜索量（Trends 只给 0-100 相对值）；想看商品/链接（用 search_amazon / google_ai_search）；只查一个关键词的瞬时值（数据量不够，至少传 2 个对比才有意义）。
Returns: data.json.{ keywordsGeoData[{ keyword, geoMapData[{ geoCode, geoName, value[], formattedValue[], hasData[] }] }], keywordsRankData[{ keyword, rankList[{ rankedKeyword[{ query, value, formattedValue, link, hasData }] }] }], timelineData[{ time, formattedTime, value[], formattedValue[] }], geoMapData[] }, taskId, url。
Pair with: ↑ keywords 来自用户或 search_amazon 找到的核心词；↓ Breakout/上升词可喂回 search_amazon 探索新机会，或喂 filter_niches 看是否成型为 niche。
Cost: ~1.5 积点/次, ~5s。
Tips: timeRange = today 12-m (默认) | today 3-m | today 5-y | all 等；region = ISO 国家码或 'WORLD'；language 影响相关查询的语言。`,
    en: `[Google Trends keyword popularity] Time series + per-region heatmap + rising related queries (with 'Breakout' tags). Compare up to 5 keywords on one chart.
Use when: user says "how hot is keyword X" / "A vs B popularity" / "any seasonality" / "which states love X" / "find breakout terms" / "new-product direction" / "trend comparison" / "is X past its peak yet".
Don't use: for absolute search volume (Trends is 0-100 relative); for products/links (use search_amazon / google_ai_search); for a single keyword's snapshot (need ≥ 2 for meaningful comparison).
Returns: data.json.{ keywordsGeoData[{ keyword, geoMapData[{ geoCode, geoName, value[], formattedValue[], hasData[] }] }], keywordsRankData[{ keyword, rankList[{ rankedKeyword[{ query, value, formattedValue, link, hasData }] }] }], timelineData[{ time, formattedTime, value[], formattedValue[] }], geoMapData[] }, taskId, url.
Pair with: ↑ keywords from user or core terms found via search_amazon; ↓ feed Breakout/rising terms back into search_amazon to explore new opportunities, or filter_niches to see if they've crystallized into a niche.
Cost: ~1.5 points/call, ~5s.
Tips: timeRange = today 12-m (default) | today 3-m | today 5-y | all ; region = ISO country code or 'WORLD'; language affects related-query language.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(
      `google_trends: keywords=[${input.keywords.join(",")}] timeRange=${input.timeRange} region=${input.region}`,
    );
    return ctx.client.post("/api/v2/google/trends", {
      timeRange: input.timeRange,
      region: input.region,
      keywords: input.keywords,
      language: input.language,
    });
  },
};
