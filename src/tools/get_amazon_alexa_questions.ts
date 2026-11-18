import { z } from "zod";

import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  asin: z.string().regex(/^[A-Za-z0-9]{10}$/).optional().describe(t({
    zh: "10 位 Amazon ASIN。asin 与 url 至少传一个；同时传时必须指向同一商品。",
    en: "10-character Amazon ASIN. Provide asin or url; if both are provided they must identify the same product.",
  })),
  url: z.string().url().optional().describe(t({
    zh: "Amazon.com 商品详情页 URL。asin 与 url 至少传一个。",
    en: "Amazon.com product-detail URL. Provide either asin or url.",
  })),
  includeAnswers: z.boolean().default(false).describe(t({
    zh: "是否并发向 Rufus 获取预设问题答案。无论取值如何，两个区域的问题都会返回；false 时所有 answer 为空。",
    en: "Whether to generate Rufus answers. Questions from both regions are always returned; when false, every answer is null.",
  })),
  region: z.enum(["region1", "region2", "all"]).default("all").describe(t({
    zh: "仅在 includeAnswers=true 时控制答案区域：region1=主图下方，region2=Product information 下方，all=全部（含页面无题时的侧边面板回退）；不会筛选返回的问题。面板问题返回于 regions.panel，source=panel。",
    en: "Only selects answer regions: region1 below the main image, region2 below Product information, all includes the side-panel fallback when inline questions are absent. Questions are never filtered. Panel suggestions appear in regions.panel with source=panel.",
  })),
  concurrency: z.number().int().min(1).max(10).default(5).describe(t({
    zh: "获取答案时的最大并发数，1–10，默认 5。",
    en: "Maximum answer-generation concurrency, 1-10. Defaults to 5.",
  })),
}).refine((value) => value.asin || value.url, {
  message: "asin or url is required",
});

export const getAmazonAlexaQuestions: Tool<typeof inputSchema> = {
  name: "get_amazon_alexa_questions",
  description: t({
    zh: "Alexa Listing API：提取指定 ASIN 商品页中的两组 Alexa/Rufus 预设问题；正文无题时回退到侧边面板初始推荐题（regions.panel），可选获取与该 ASIN 绑定的答案。问题收 5 积分，每个成功答案区域增加 20，面板答案按一个区域结算；实际为 0/5/25/45。无题或服务端失败为 0，明确无效 ASIN 收 5。",
    en: "Alexa Listing API: extract both Alexa/Rufus preset-question regions from a logged-in Amazon PDP; if neither has questions, use the product panel's initial suggestions (regions.panel). Optionally answer in that ASIN context. Questions cost 5 points and each answered region adds 20 (0/5/25/45 total); panel answers count as one region. No-question and service failures cost 0; explicitly invalid ASINs cost 5.",
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(`get_amazon_alexa_questions: region=${input.region} includeAnswers=${input.includeAnswers}`);
    return ctx.client.post("/api/v2/amazon/alexa-questions", {
      ...(input.asin ? { asin: input.asin } : {}),
      ...(input.url ? { url: input.url } : {}),
      includeAnswers: input.includeAnswers,
      region: input.region,
      concurrency: input.concurrency,
      timeout: input.includeAnswers ? 240000 : 120000,
    });
  },
};
