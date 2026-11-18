import type { Tool } from "./_types.js";
import { t } from "../i18n.js";
import { PangolinfoError } from "../errors.js";
import { socialCollectorInputSchema } from "./social_collector_schema.js";

// 只做参数组织和转发。计费、供应商鉴权与平台字段解析均在Java后端，MCP不持有上游密钥。
const inputSchema = socialCollectorInputSchema;

export const collectSocialData: Tool<typeof inputSchema> = {
  name: "collect_social_data",
  description: t({
    zh: `[Social Media API] 调用9个平台的46个社媒采集接口：Pinterest、Threads、Instagram、YouTube、Facebook、Reddit、TikTok、X、Trustpilot。
Use when: 采集帖子、主页、作品、搜索结果、评论/回复、视频字幕或统计数据。
Returns: 原生data与meta，另含pointCost和billing{billedCount,unitPrice,ruleVersion,counts}。游标按原平台返回和续传。
Cost: 0.8积点/主体结果；独立回复模式按直接回复计费，Facebook含嵌套回复。post附带一页评论和home附带一页作品免费。搜索/评论默认1页，最多5页；其余参数以各操作Schema为准，未开放字段忽略。字幕按一份轨道计费。`,
    en: `[Social Media API] Access 46 operations across Pinterest, Threads, Instagram, YouTube, Facebook, Reddit, TikTok, X and Trustpilot.
Use when: collecting posts, profiles, works, search results, comments/replies, transcripts or engagement counters.
Returns: Native data and meta plus pointCost and billing{billedCount,unitPrice,ruleVersion,counts}. Pass native cursors back unchanged.
Cost: 0.8 points per primary result, including direct replies in explicit reply mode. Facebook includes nested replies. One page of comments included in posts and works included in home responses is free. Search/comments default to one page, capped at five. Only operation-specific schema fields are accepted. One transcript track counts once.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) throw new PangolinfoError("BAD_INPUT", 400, parsed.error.message);
    const { api, target } = parsed.data;
    const body = { target, ...("options" in parsed.data ? { options: parsed.data.options } : {}) };
    ctx.logger.info(`collect_social_data: api=${api}`);
    // 内部固定75秒截止，HTTP客户端额外等待15秒；不作为工具输入开放。
    return ctx.client.post(`/api/v1/social/${api}`, body, 75000);
  },
};
