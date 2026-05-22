/**
 * Pangolinfo MCP - tool: search_local_maps
 *
 * Per CONTRACT.md §2 / §8 and CONTRACT-tools.md §8 — search Google
 * Maps for local businesses via
 * POST /api/v3/extract/search/maps/local on scrape_base.
 *
 * Backend wants `ll` as a packed "lat,lng,zoomz" string (regex
 * enforced). We expose clean lat/lng/zoom fields to the AI and
 * assemble the wire format in execute.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      t({
        zh: "本地搜索关键词。Examples: 'coffee shop' / 'wholesale electronics' / '电子产品批发' / 'pet store'。",
        en: "Local search query. Examples: 'coffee shop' / 'wholesale electronics' / '电子产品批发' / 'pet store'.",
      }),
    ),
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .describe(
      t({
        zh: "搜索中心点的纬度。Examples: 37.7822 (旧金山) / 40.7128 (纽约) / 34.0522 (洛杉矶)。",
        en: "Latitude of search center. Examples: 37.7822 (San Francisco) / 40.7128 (New York) / 34.0522 (Los Angeles).",
      }),
    ),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .describe(
      t({
        zh: "搜索中心点的经度。Examples: -122.4642 (旧金山) / -74.0060 (纽约) / -118.2437 (洛杉矶)。",
        en: "Longitude of search center. Examples: -122.4642 (San Francisco) / -74.0060 (New York) / -118.2437 (Los Angeles).",
      }),
    ),
  zoom: z
    .number()
    .int()
    .min(1)
    .max(21)
    .default(13)
    .describe(
      t({
        zh: "地图缩放级别，1=全球，13=城市，21=单栋建筑。默认 13。",
        en: "Map zoom level, 1=world, 13=city, 21=building. Default 13.",
      }),
    ),
  language: z
    .string()
    .default("en")
    .describe(
      t({
        zh: "BCP-47 语言码，例如 'en'、'zh-CN'。",
        en: "BCP-47 language code, e.g. 'en', 'zh-CN'.",
      }),
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe(
      t({
        zh: "返回的最大结果数（1-100）。",
        en: "Max results to return (1-100).",
      }),
    ),
});

export const searchLocalMaps: Tool<typeof inputSchema> = {
  name: "search_local_maps",
  description: t({
    zh: `[Google Maps 本地商家搜索] 在指定经纬度范围搜本地商家，返回名称/地址/评分/评论数等。
Use when: 用户说"X 城市的 Y 商家""本地零售调研""线下渠道分布""某区域的咖啡店/超市/批发商""品牌实体店覆盖密度"；做线下竞品/渠道调研；判断某品类在某地区的实体供给密度。
Don't use: 想要电商商品（用 Amazon 系列）；想要全球趋势（用 google_trends）；想要 Google 搜索结果（用 google_ai_search）。
Returns: data.organicResults[{ place_id, name, about, rating, number_of_reviews, borough, street_addr, city, postal_code, ... }]。
Pair with: ↑ query (商家关键词) + latitude/longitude/zoom 定位（zoom 1=世界, 13=城市, 21=单栋建筑）；↓ 主要给人看分布，下游通常不接其他 tool。
Cost: ~1.5 积点/次, ~5s。
Tips: zoom 默认 13（城市级别）就能拿到一片商家；缩到 17+ 才聚焦到一条街。`,
    en: `[Google Maps local-business search] Search local businesses at a given lat/lng — returns name, address, rating, review count, etc.
Use when: user says "Y businesses in city X" / "local retail research" / "offline channel distribution" / "coffee shops/supermarkets/wholesalers in area" / "physical-store coverage density"; offline competitor/channel research; gauging physical-supply density of a category in a region.
Don't use: for e-commerce listings (Amazon series); for global trends (use google_trends); for Google search results (use google_ai_search).
Returns: data.organicResults[{ place_id, name, about, rating, number_of_reviews, borough, street_addr, city, postal_code, ... }].
Pair with: ↑ query (business keyword) + latitude/longitude/zoom (zoom 1=world, 13=city, 21=single building); ↓ presentation-focused, downstream rarely consumes.
Cost: ~1.5 points/call, ~5s.
Tips: zoom 13 (city, default) gives you a whole neighborhood; zoom 17+ narrows to one street.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(
      `search_local_maps: q="${input.query}" ll=${input.latitude},${input.longitude},${input.zoom}z`,
    );
    return ctx.client.post("/api/v3/extract/search/maps/local", {
      q: input.query,
      ll: `${input.latitude},${input.longitude},${input.zoom}z`,
      hl: input.language,
      num: input.limit,
    });
  },
};
