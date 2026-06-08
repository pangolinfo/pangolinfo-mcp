/**
 * Pangolinfo MCP - tool: wipo_search
 *
 * Wraps POST /api/v3/wipo — WIPO Global Design Database search.
 *
 * Verified 2026-05-19 against scrapeapi prod: { source:"USID", hol:"APPLE" }
 * returns Apple's US design-patent hits with IRN / HOL / DETAIL_DATA / IMG /
 * IMG_DATA / DC / RD / STATUS / LCS fields. pointCost=2.
 *
 * enable_litigation (2026-06): when true, the backend chains a US litigation
 * (PACER) lookup by patent number and joins cases into each hit as
 * litigationStatus / caseTotal / cases[{ caseId, docketNumber, ... }].
 * Charged +12 only when a patent is found (formerly the standalone pacer_search
 * tool, now folded into wipo_search; the standalone tool was retired).
 *
 * BACKEND PERF CONTRACT (backend reads OSS Parquet via DuckDB and rejects /
 * full-scans on wrong params):
 *   - `source` is REQUIRED (USID / CNID / DEID / JPID / KRID / EMID / FRID
 *     / INID / ITID / ESID / CHID / HAGUE). Country codes auto-normalize:
 *     US→USID, CN→CNID.
 *   - CNID + fuzzy (`hol` or `prod`) MUST also include one of `id`,
 *     `idSearch`, `rd`, `status`, `lcs` — otherwise hard-fail client-side.
 *   - CNID + `ed` rejected (DETAIL_DATA absent on CNID). Use `rd` instead.
 *   - DEID/JPID/USID/KRID/EMID + fuzzy without narrowing → backend can hit
 *     25s query timeout; we warn but proceed.
 *   - `ed` is silently ignored on ALL sources (upstream schema lacks the
 *     expiration-date key). We warn.
 *   - Schema gaps: USID has no STATUS, JPID has no HOL/PROD.
 *
 * Note: the upstream doc flags `irn` as required but that's incorrect —
 * `source` is the real required field. Empty `irn` works fine.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { PangolinfoError } from "../errors.js";
import { t } from "../i18n.js";

const SOURCES = [
  "USID",
  "CNID",
  "DEID",
  "JPID",
  "KRID",
  "EMID",
  "FRID",
  "INID",
  "ITID",
  "ESID",
  "CHID",
  "HAGUE",
] as const;

const inputSchema = z.object({
  source: z
    .enum(SOURCES)
    .describe(
      t({
        zh: "数据来源（必填）。WIPO 数据按 source 分区存储，跨 source 不可查。常用：USID（美国外观）、CNID（中国外观，17M+ 条）、HAGUE（海牙体系国际注册）、DEID、JPID。",
        en: "Data source (required). WIPO data is partitioned by source — cross-source queries not supported. Common: USID (US design), CNID (China design, 17M+ rows), HAGUE (Hague international), DEID, JPID.",
      }),
    ),
  ds: z
    .string()
    .optional()
    .describe(
      t({
        zh: "指定国家代码（如 'US'、'CN'）。可选——传 source 时通常已隐含国家。",
        en: "Designated country code (e.g. 'US', 'CN'). Optional — usually implied by `source`.",
      }),
    ),
  hol: z
    .string()
    .optional()
    .describe(
      t({
        zh: "权利人（公司或个人）名称模糊匹配。Examples: 'Apple' / 'Samsung' / 'Nike'。注意：CNID + hol 必须配合 id/idSearch/rd/status/lcs 至少一项；JPID 无 HOL 字段（会被忽略）。",
        en: "Holder name fuzzy match. Examples: 'Apple' / 'Samsung' / 'Nike'. NOTE: CNID + hol MUST be paired with id/idSearch/rd/status/lcs; JPID has no HOL column (will be ignored).",
      }),
    ),
  prod: z
    .string()
    .optional()
    .describe(
      t({
        zh: "产品名称模糊匹配。CNID 搜中文，其他 source 搜英文。Examples: '椅子' (CNID) / 'wireless headphones' (USID) / 'iphone case' (USID)。CNID + prod 必须配合 id/idSearch/rd/status/lcs；JPID 无 PROD 字段。",
        en: "Product name fuzzy match. CNID searches Chinese, other sources search English. Examples: '椅子' (CNID) / 'wireless headphones' (USID) / 'iphone case' (USID). CNID + prod MUST be paired with id/idSearch/rd/status/lcs; JPID has no PROD column.",
      }),
    ),
  irn: z
    .string()
    .optional()
    .describe(
      t({
        zh: "国际注册号精确匹配。Examples: 'DM/000298'（HAGUE）/ 'D1107730'（USID）。",
        en: "International Registration Number exact match. Examples: 'DM/000298' (HAGUE) / 'D1107730' (USID).",
      }),
    ),
  id: z
    .string()
    .optional()
    .describe(
      t({
        zh: "完整 ID 精确匹配，如 'CNID.2023.123456'。用于 CNID 路由到单分区，避免全表扫描。",
        en: "Full ID exact match, e.g. 'CNID.2023.123456'. Routes CNID queries to a single partition (avoids full scan).",
      }),
    ),
  idSearch: z
    .string()
    .optional()
    .describe(
      t({
        zh: "ID 变体模糊匹配。",
        en: "ID variant fuzzy match.",
      }),
    ),
  rd: z
    .string()
    .optional()
    .describe(
      t({
        zh: "注册日期（YYYY 或 YYYY-MM-DD）。CNID 必备的窄化字段之一，能把查询路由到年份分区。",
        en: "Registration date (YYYY or YYYY-MM-DD). One of the recommended narrowing fields for CNID — routes to a year partition.",
      }),
    ),
  status: z
    .string()
    .optional()
    .describe(
      t({
        zh: "法律状态：'ACT'（生效）、'EXP'（过期）等。USID 无 STATUS 字段（会被忽略）。",
        en: "Legal status: 'ACT' (active), 'EXP' (expired), etc. USID has no STATUS column (will be ignored).",
      }),
    ),
  lcs: z
    .string()
    .optional()
    .describe(
      t({
        zh: "外观设计分类（洛迦诺分类号 LCS），如 '23-01' = 流体分配设备。",
        en: "Design classification (Locarno Classification code), e.g. '23-01' = fluid distribution equipment.",
      }),
    ),
  from: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      t({ zh: "分页起始位置，从 0 开始。", en: "Pagination offset, 0-based." }),
    ),
  num: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe(
      t({
        zh: "每页条数（默认 10，上限 100）。",
        en: "Page size (default 10, max 100).",
      }),
    ),
  enableLitigation: z
    .boolean()
    .default(false)
    .describe(
      t({
        zh: "是否开启智能联动风控模式：命中专利后自动用专利号查关联的美国诉讼案件（底层 PACER），案件 join 进每条专利的 cases 字段。默认 false。开启后每条命中专利会多 litigationStatus / caseTotal / cases 字段；仅当查到专利才额外计费 +12 积点（没查到专利不收）。",
        en: "Enable Smart Risk Control Mode: after patents match, auto-query related US litigation (PACER backend) by patent number; cases are joined into each patent's `cases` field. Default false. When on, each matched patent gains litigationStatus / caseTotal / cases; +12 points charged only when a patent is found (free if none).",
      }),
    ),
});

export const wipoSearch: Tool<typeof inputSchema> = {
  name: "wipo_search",
  description: t({
    zh: `[WIPO 全球外观设计 / 商标检索] 查 WIPO 全球外观设计数据库（USPTO 美国外观、CNID 中国、HAGUE 海牙国际注册等 12 个 source）。
Use when: 用户说"查商标""查外观专利""新品有没有侵权风险""X 公司的专利布局""WIPO 检索""USPTO 查询""DM/XXX 这个国际注册号是什么"；选品 / GTM SOP 里立项前的 IP 风险排查；竞品 IP 布局调研。
Don't use: 想查关键词排名 / 商品评论 / 商品详情（这是 IP 数据库，不是商品库）；只想要美国注册商标文字检索（这个数据库主要是外观设计，文字商标覆盖有限）。
Returns: data.data.{ total, hits[{ IRN, HOL[], DETAIL_DATA.structured.{indication_of_products, statement_of_novelty, ...}, IMG[], IMG_DATA[{filename,url}], DC, RD, STATUS, LCS[], DS[], PROD[], SOURCE, DETAIL_URL }] }。开 enableLitigation=true 时每条命中专利额外追加 litigationStatus(success/skipped/failed) + caseTotal + cases[{ caseId, docketNumber, caseName, court, status, dateFiled, parties[], patentNumbers[], entries[] }]（底层是美国 PACER 诉讼数据，一次调用直出专利+诉讼）。
Pair with: ↑ 必填 source；hol=权利人 / prod=产品名 / irn=国际注册号 / lcs=外观设计分类号；enableLitigation=true 联动查美国诉讼（侵权风险闭环，无需再调别的工具）；↓ DETAIL_URL 可让用户跳转 WIPO 官网核查。
Cost: ~2 积点/次, ~5s；enableLitigation=true 且查到专利再 +12 积点（没查到专利不收）。
⚠️ 性能契约: CNID + hol/prod 必须配 id/idSearch/rd/status/lcs 至少一项（否则 17M 行全表扫描会被拒）；JPID 无 HOL/PROD 字段；USID 无 STATUS 字段；ed (过期日期) 在所有 source 都被忽略，要按日期筛用 rd。开 enableLitigation 后每翻一页都会重新触发诉讼查询与计费。`,
    en: `[WIPO global design / IP search] Query the WIPO design database across 12 sources (USPTO US designs, CNID China, HAGUE international registrations, …).
Use when: user says "check trademark" / "design patent search" / "any IP risk for new product" / "X company's patent portfolio" / "WIPO search" / "USPTO query" / "what is registration DM/XXX"; pre-launch IP clearance during scouting/GTM SOPs; competitor IP-portfolio research.
Don't use: for keyword ranks / product reviews / product detail (this is an IP database, not a commerce database); for US text-trademark search (this DB focuses on design patents — text trademark coverage is limited).
Returns: data.data.{ total, hits[{ IRN, HOL[], DETAIL_DATA.structured.{indication_of_products, statement_of_novelty, ...}, IMG[], IMG_DATA[{filename,url}], DC, RD, STATUS, LCS[], DS[], PROD[], SOURCE, DETAIL_URL }] }. With enableLitigation=true each matched patent additionally carries litigationStatus(success/skipped/failed) + caseTotal + cases[{ caseId, docketNumber, caseName, court, status, dateFiled, parties[], patentNumbers[], entries[] }] (backed by US PACER litigation data — one call returns patents + lawsuits).
Pair with: ↑ source required; hol=holder name / prod=product name / irn=international registration / lcs=design classification; enableLitigation=true chains US litigation lookup (IP-risk loop, no separate tool needed); ↓ DETAIL_URL lets the user jump to WIPO's official page to verify.
Cost: ~2 points/call, ~5s; with enableLitigation=true add +12 points only when a patent is found (free if none).
⚠️ Perf contract: CNID + hol/prod MUST be paired with id/idSearch/rd/status/lcs (otherwise the backend rejects to avoid a 17M-row full scan); JPID has no HOL/PROD; USID has no STATUS; ed (expiration date) is silently ignored on all sources — filter dates via rd instead. With enableLitigation on, each page re-triggers the litigation query and billing.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    // Mirror the wipo.py client-side perf contract.
    const isFuzzy = !!(input.hol || input.prod);
    const isNarrowed = !!(input.id || input.idSearch || input.rd || input.status || input.lcs);

    if (input.source === "CNID" && isFuzzy && !isNarrowed) {
      throw new PangolinfoError(
        "BAD_INPUT",
        400,
        "CNID + hol/prod requires one of: id, idSearch, rd, status, lcs — otherwise the backend will reject the request to avoid a full table scan over 17M rows.",
      );
    }

    ctx.logger.info(
      `wipo_search: source=${input.source} hol=${input.hol ?? ""} prod=${input.prod ?? ""} irn=${input.irn ?? ""} from=${input.from} num=${input.num} enableLitigation=${input.enableLitigation}`,
    );

    // Build request body — only include set fields plus required `source`.
    const body: Record<string, unknown> = {
      source: input.source,
      from: input.from,
      num: input.num,
    };
    if (input.ds) body.ds = input.ds;
    if (input.hol) body.hol = input.hol;
    if (input.prod) body.prod = input.prod;
    if (input.irn) body.irn = input.irn;
    if (input.id) body.id = input.id;
    if (input.idSearch) body.id_search = input.idSearch; // backend snake_case
    if (input.rd) body.rd = input.rd;
    if (input.status) body.status = input.status;
    if (input.lcs) body.lcs = input.lcs;
    if (input.enableLitigation) body.enable_litigation = true; // backend snake_case; only send when on

    return ctx.client.post("/api/v3/wipo", body);
  },
};
