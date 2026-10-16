/** Alexa Agent: independent marketplace pools; native HTTP unless a screenshot is requested. */
import { z } from "zod";
import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  prompts: z.array(z.string().min(1)).min(1).max(5).describe(t({
    zh: "1–5 条自然语言问题。同一次调用内按顺序连续对话，不同调用之间不保留上下文。每条 6 积点（N 条=N×6），多轮会累加耗时。",
    en: "1–5 natural-language prompts. Prompts within one call form a sequential conversation; separate calls do not retain context. Each prompt costs 6 points (N prompts=N×6); multiple turns increase latency.",
  })),
  site: z.enum(["us", "jp"]).default("us").describe(t({
    zh: "Amazon 站点：us 美国（默认）、jp 日本。使用独立账号池，未开通的站点会报错，不回退到美国。",
    en: "Amazon marketplace: us (United States, default) or jp (Japan). Pools are isolated; unavailable markets fail rather than falling back to the US.",
  })),
  screenshot: z.boolean().default(false).describe(t({
    zh: "是否返回页面截图。默认 false 使用原生 HTTP；true 显式使用较慢的页面操作通道。",
    en: "Return a page screenshot. False uses native HTTP; true explicitly selects the slower browser-rendered path.",
  })),
});

export const searchAmazonAlexa: Tool<typeof inputSchema> = {
  name: "search_amazon_alexa",
  description: t({
    zh: `[Alexa Agent API] 向 Amazon Rufus 提问，返回回答、分组商品推荐和追问建议。支持美国（默认）与日本独立账号池。
Use when: 场景选品、送礼、开放式购物咨询；明确关键词用 search_amazon，单 ASIN 详情用 get_amazon_product。
Returns: data.json[{prompt,status,content,products[{title,items[{asin,url,title,cover,score,ratingsCount,price,originalPrice,describe}]}],follow_up_questions[],refusal_message?}]; status=answered 已回答 / refused Amazon 拒答（content 为空，refusal_message 为拒答原文）/ failed 本轮未取得。商品和追问是否存在由 Amazon 回答决定，可能为空。
Cost: 每条答出的 prompt 6 积点；被拒答或失败的轮次不计费。所有轮都被拒答时返回 ALEXA_REFUSED（9207，未计费，原样重试同样会被拒，应换问法）。单次调用内多轮有上下文，跨调用不保留上下文。
非截图请求使用原生 HTTP，截图请求使用页面通道。响应时间随账号初始化、网络和问题变化，不承诺固定秒数。客户端工具超时建议至少 120 秒；不要因为暂未返回就并发重复请求。`,
    en: `[Alexa Agent API] Ask Amazon Rufus and receive answers, grouped product recommendations and follow-up suggestions. Separate pools support the United States (default) and Japan.
Use when: scenario-based discovery, gifts or open-ended shopping advice. Use search_amazon for explicit keywords and get_amazon_product for a single ASIN.
Returns: data.json[{prompt,status,content,products[{title,items[{asin,url,title,cover,score,ratingsCount,price,originalPrice,describe}]}],follow_up_questions[],refusal_message?}]. status is answered, refused (Amazon declined: content is empty and refusal_message holds its wording) or failed (this turn was not obtained). Products and suggestions depend on Amazon's answer and may be empty.
Cost: 6 points per answered prompt; refused or failed turns are not billed. If every turn is declined the call fails with ALEXA_REFUSED (9207, not billed; the same prompt will be declined again, so rephrase instead of retrying). Turns within one call share context; separate calls do not.
Non-screenshot requests use native HTTP; screenshots use the browser path. Latency varies with initialization, network and question, with no fixed-time guarantee. Allow at least 120 seconds in the client; do not issue concurrent duplicates while waiting.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(`search_amazon_alexa: site=${input.site} prompts=${input.prompts.length} screenshot=${input.screenshot}`);
    return ctx.client.post("/api/v2/scrape", {
      parserName: "amazonAlexa",
      site: input.site,
      param: input.prompts,
      screenshot: input.screenshot,
      scrapeContext: { alexaMode: input.screenshot ? "playwright" : "direct" },
      timeout: 240000,
    });
  },
};
