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
    zh: "是否返回页面截图。通用问答默认使用原生 HTTP；商品定向问答及截图请求使用页面通道。",
    en: "Return a page screenshot. General questions use native HTTP by default; product-targeted questions and screenshots use the browser path.",
  })),
  asin: z.string().regex(/^[A-Za-z0-9]{10}$/).optional().describe(t({
    zh: "可选，美国站商品 ASIN。指定后在该商品详情页上下文中提问，支持图书；可与 url 二选一，同时传时须一致。",
    en: "Optional US product ASIN. Ask in that product's detail-page context, including books. Supply asin or url; if both are supplied they must match.",
  })),
  url: z.string().url().optional().describe(t({
    zh: "可选，amazon.com 商品详情页 URL；指定后使用商品页面板，响应可能较慢。",
    en: "Optional amazon.com product detail URL. Uses the product-page panel and may take longer than a general query.",
  })),
});

export const searchAmazonAlexa: Tool<typeof inputSchema> = {
  name: "search_amazon_alexa",
  description: t({
    zh: `[Alexa Agent API] 向 Amazon Rufus 提问，返回回答、分组商品推荐和追问建议。支持美国（默认）与日本独立账号池。
Use when: 场景选品、送礼、开放式购物咨询；明确关键词用 search_amazon，单 ASIN 详情用 get_amazon_product。
Returns: data.json[{prompt,status,content,products[{title,items[{asin,url,title,cover,score,ratingsCount,price,originalPrice,describe}]}],follow_up_questions[],refusal_message?}]; status=answered 已回答 / refused Amazon 拒答（content 为空，refusal_message 为拒答原文）/ failed 本轮未取得。商品和追问是否存在由 Amazon 回答决定，可能为空。
Cost: 每条答出的 prompt 6 积点；被拒答或失败的轮次不计费。所有轮都被拒答时返回 ALEXA_REFUSED（9207，未计费，原样重试同样会被拒，应换问法）。单次调用内多轮有上下文，跨调用不保留上下文。
通用非截图请求使用原生 HTTP，商品定向及截图请求使用页面通道。美国站可用 asin 或 url 绑定商品（含图书），两者同时传时须一致；返回 asin 与 context_source=product_page 表示实际商品上下文已核验。响应时间随账号初始化、网络和问题变化，不承诺固定秒数。客户端工具超时建议至少 120 秒；不要因为暂未返回就并发重复请求。`,
    en: `[Alexa Agent API] Ask Amazon Rufus and receive answers, grouped product recommendations and follow-up suggestions. Separate pools support the United States (default) and Japan.
Use when: scenario-based discovery, gifts or open-ended shopping advice. Use search_amazon for explicit keywords and get_amazon_product for a single ASIN.
Returns: data.json[{prompt,status,content,products[{title,items[{asin,url,title,cover,score,ratingsCount,price,originalPrice,describe}]}],follow_up_questions[],refusal_message?}]. status is answered, refused (Amazon declined: content is empty and refusal_message holds its wording) or failed (this turn was not obtained). Products and suggestions depend on Amazon's answer and may be empty.
Cost: 6 points per answered prompt; refused or failed turns are not billed. If every turn is declined the call fails with ALEXA_REFUSED (9207, not billed; the same prompt will be declined again, so rephrase instead of retrying). Turns within one call share context; separate calls do not.
General non-screenshot questions use native HTTP; product-targeted questions and screenshots use the browser path. US queries accept asin or url (including books); both must match when supplied together. Returned asin and context_source=product_page indicate verified PDP context. Latency varies with initialization, network and question, with no fixed-time guarantee. Allow at least 120 seconds in the client; do not issue concurrent duplicates while waiting.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info(`search_amazon_alexa: site=${input.site} prompts=${input.prompts.length} screenshot=${input.screenshot}`);
    return ctx.client.post("/api/v2/scrape", {
      parserName: "amazonAlexa",
      site: input.site,
      param: input.prompts,
      screenshot: input.screenshot,
      ...(input.asin ? { asin: input.asin } : {}),
      ...(input.url ? { url: input.url } : {}),
      scrapeContext: { alexaMode: input.screenshot ? "playwright" : "direct" },
      timeout: 240000,
    });
  },
};
