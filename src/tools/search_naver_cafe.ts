import { z } from "zod";
import type { Tool } from "./_types.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  keyword: z.string().min(1).max(100),
  country: z.literal("KR").default("KR"),
  page: z.number().int().min(1).max(1020).optional(),
  pageSize: z.number().int().min(1).max(30).optional(),
  includeComments: z.boolean().optional(),
  commentPage: z.number().int().min(1).max(20).optional(),
  commentPageSize: z.union([z.literal(20),z.literal(100)]).optional(),
  commentPages: z.number().int().min(1).max(20).optional(),
  includeNative: z.boolean().optional(),
  refresh: z.boolean().optional(),
  allowStale: z.boolean().optional(),
}).strict();

export const searchNaverCafe: Tool<typeof inputSchema> = {
  name: "search_naver_cafe",
  description: t({
    zh: "按关键词检索韩国Naver Cafe公开帖子全文及评论/回复。data.results为帖子，content为正文，comments为附带评论。保留帖子pagination及每帖commentPagination，按nextPage继续；每批最多30帖，评论页范围1–20、每页20或100条。0.8积点/返回的唯一帖子，附带评论/回复免费；部分失败见failures和meta.status。",
    en: "Search public Korean Naver Cafe full posts and included comments/replies by keyword. data.results contains posts with content and comments. Follow pagination.nextPage for posts and commentPagination per post. Up to 30 posts per batch; comment pages 1–20 with 20 or 100 items per page. Costs 0.8 points per unique returned post; included comments/replies are free. Partial failures remain in failures and meta.status.",
  }),
  inputSchema,
  async execute(input, ctx) {
    ctx.logger.info("search_naver_cafe: request");
    return ctx.client.post("/api/v1/social/naver-cafe/posts", input, 230000);
  },
};
