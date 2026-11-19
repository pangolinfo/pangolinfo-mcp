import { z } from "zod";
import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  asin: z.string().regex(/^[A-Za-z0-9]{10}$/).describe(t({
    zh: "10 位 Amazon ASIN，例如 B0BVB2SDGR。", en: "10-character Amazon ASIN, e.g. B0BVB2SDGR.",
  })),
  country: z.enum(["US", "UK", "DE", "FR", "IT", "ES", "JP", "CA", "AU"]).default("US")
    .describe(t({ zh: "Amazon 国家站点，默认 US。", en: "Amazon marketplace country, defaults to US." })),
  zipcode: z.string().optional().describe(t({
    zh: "可选，仅用于 PDP 抓取的目的地邮编；不传按国家自动补一个白名单邮编，传入值须在该国白名单内。弹窗为该国家下的匿名视图。",
    en: "Optional destination postcode for the PDP only; omitted means one for the country is picked automatically, provided must be in the country allowlist. The popup is the country's anonymous view.",
  })),
});

export const getAmazonVideos: Tool<typeof inputSchema> = {
  name: "get_amazon_videos",
  description: t({
    zh: "获取 ASIN 三个位置的视频：主图弹窗分类及数量、Premium A+ hero 视频与摆放位置、Product Videos 标题/作者/来源/红人标签。支持 MP4/HLS、多视频；保留商家/红人/买家原始类型，不推断竞对。三块清单独立，不相加。正常结果（含无视频）1 积分，采集失败不扣费。",
    en: "Collect ASIN video placements: grouped main-media popup, Premium A+ hero videos and positions, and Product Videos titles/authors/creator types/disclosure labels. Supports MP4/HLS and multiple videos. Lists remain independent; competitor ownership is not inferred. Successful results, including no videos, cost 1 point; collection failures cost 0.",
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(`get_amazon_videos: country=${input.country}`);
    return ctx.client.post("/api/v1/amazon/videos", {
      asin: input.asin.toUpperCase(), country: input.country,
      ...(input.zipcode ? { zipcode: input.zipcode } : {}),
    }, { deadlineMs: 115_000 });
  },
};
