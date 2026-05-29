/**
 * Pangolinfo MCP - tool: pacer_search
 *
 * Wraps POST /api/v3/pacer — US patent-litigation (PACER) case search.
 *
 * Verified 2026-05-29 against scrapeapi prod: { patentNumber: "6424636" }
 * returns the matching case docket(s) with docketNumber / caseName / court /
 * parties / patentNumbers / status / dateFiled + an inline `entries[]`
 * litigation event timeline (documentNumber / dateFiled / description /
 * pdfUrl). pointCost = 5.
 *
 * BACKEND CONTRACT:
 *   - At least ONE of patentNumber / companyName / caseNumber is required;
 *     when multiple are supplied they are combined with AND (intersection).
 *   - patentNumber: exact match (commas/spaces stripped, upper-cased server-side).
 *   - companyName: prefix match against party names (plaintiff/defendant).
 *   - caseNumber: exact match on the court docketNumber, e.g. "3:90-cv-00003".
 *   - size capped at 50 server-side; entrySize capped at 200 server-side.
 *   - 30s server timeout — narrow the query (add a precise patent/case number)
 *     if it times out.
 *   - Response envelope mirrors wipo_search: { data: { total, hits: [] } }.
 *
 * Pairs naturally with wipo_search: use wipo_search to surface infringement-risk
 * patent numbers, then pacer_search to locate the corresponding US lawsuits.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { PangolinfoError } from "../errors.js";
import { t } from "../i18n.js";

const inputSchema = z.object({
  patentNumber: z
    .string()
    .optional()
    .describe(
      t({
        zh: "专利号(精确匹配,后端会去逗号/空格并大写)。Examples: '6424636' / '7817532'。patentNumber / companyName / caseNumber 三选一,至少传一个;多个同传则 AND 取交集。",
        en: "Patent number (exact match; server strips commas/spaces and upper-cases). Examples: '6424636' / '7817532'. One of patentNumber / companyName / caseNumber is required; multiple are combined with AND.",
      }),
    ),
  companyName: z
    .string()
    .optional()
    .describe(
      t({
        zh: "起诉/被告公司名(前缀匹配 party name)。Examples: 'Apple' / 'AT&T' / 'Intellectual Ventures'。",
        en: "Plaintiff/defendant company name (prefix match on party name). Examples: 'Apple' / 'AT&T' / 'Intellectual Ventures'.",
      }),
    ),
  caseNumber: z
    .string()
    .optional()
    .describe(
      t({
        zh: "法院案件号 docketNumber(精确匹配)。Example: '3:90-cv-00003' / '1:13-cv-00116'。",
        en: "Court case number / docketNumber (exact match). Example: '3:90-cv-00003' / '1:13-cv-00116'.",
      }),
    ),
  from: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      t({ zh: "案件分页起始偏移,从 0 开始。", en: "Case pagination offset, 0-based." }),
    ),
  size: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe(
      t({
        zh: "每页案件数(默认 10,上限 50)。",
        en: "Cases per page (default 10, max 50).",
      }),
    ),
  entrySize: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe(
      t({
        zh: "每个案件内联返回的 docket 流水(entries)上限(默认 50,上限 200),防超大案。完整流水条数见返回里的 entryTotal。",
        en: "Max inline docket timeline entries returned per case (default 50, max 200) to guard against huge cases. The full count is in the returned entryTotal.",
      }),
    ),
});

export const pacerSearch: Tool<typeof inputSchema> = {
  name: "pacer_search",
  description: t({
    zh: `[PACER 美国专利诉讼检索] 按专利号 / 公司名 / 法院案件号查美国联邦法院专利诉讼案件,返回案件档案 + 完整 docket 流水时间线。
Use when: 用户说"查美国专利诉讼""这个专利被起诉过吗""X 公司有没有专利官司""某案件号的进展""新品所用专利有没有诉讼史""IP 侵权风险排查(诉讼维度)";WIPO 查到风险专利号后,下一步定位对应的美国诉讼。
Don't use: 想查外观专利/商标本身(用 wipo_search);想查商品/评论/排名(这是诉讼库,不是商品库)。
Returns: data.data.{ total, hits[{ docketId, docketNumber, pacerCaseId, caseName, court, courtId, assignedTo, suitNature, jurisdiction, status, dateFiled, dateTerminated, parties[], patentNumbers[], entryTotal, entries[{ documentNumber, dateFiled, description, documentHref, pdfUrl, patentNumbers[] }] }] }(双层 data 外壳,与 wipo_search 一致)。
Pair with: ↑ patentNumber / companyName / caseNumber 至少一个,多个 AND 取交集;↑ 常接 wipo_search(先 WIPO 找风险专利号 → 再 pacer_search 定位诉讼);↓ entries[].pdfUrl 可让用户下载原始法律文书。
Cost: ~5 积点/次, ~3s。
⚠️ 三个查询条件至少传一个,否则报错;size 上限 50,entrySize 上限 200;30s 超时则补更精确的专利号/案件号缩小范围。`,
    en: `[PACER US patent-litigation search] Search US federal-court patent lawsuits by patent number / company name / court case number; returns the case docket plus the full litigation event timeline.
Use when: user says "search US patent litigation" / "has this patent been litigated" / "does company X have patent lawsuits" / "status of case number X" / "litigation history of a patent used in my new product" / "IP infringement risk (litigation angle)"; the step after WIPO surfaces a risky patent number — locate the matching US lawsuit.
Don't use: to look up the design patent / trademark itself (use wipo_search); for products / reviews / ranks (this is a litigation database, not a commerce one).
Returns: data.data.{ total, hits[{ docketId, docketNumber, pacerCaseId, caseName, court, courtId, assignedTo, suitNature, jurisdiction, status, dateFiled, dateTerminated, parties[], patentNumbers[], entryTotal, entries[{ documentNumber, dateFiled, description, documentHref, pdfUrl, patentNumbers[] }] }] } (double-data envelope, same as wipo_search).
Pair with: ↑ at least one of patentNumber / companyName / caseNumber, multiple combined with AND; ↑ commonly chained after wipo_search (WIPO finds the risky patent number → pacer_search locates the lawsuit); ↓ entries[].pdfUrl lets the user download the original legal filing.
Cost: ~5 points/call, ~3s.
⚠️ At least one of the three query conditions is required or it errors; size capped at 50, entrySize at 200; on a 30s timeout, narrow with a more precise patent/case number.`,
  }),
  inputSchema,
  async execute(input, ctx) {
    const patentNumber = input.patentNumber?.trim() || undefined;
    const companyName = input.companyName?.trim() || undefined;
    const caseNumber = input.caseNumber?.trim() || undefined;

    if (!patentNumber && !companyName && !caseNumber) {
      throw new PangolinfoError(
        "BAD_INPUT",
        400,
        "pacer_search requires at least one of: patentNumber, companyName, caseNumber.",
      );
    }

    ctx.logger.info(
      `pacer_search: patentNumber=${patentNumber ?? ""} companyName=${companyName ?? ""} caseNumber=${caseNumber ?? ""} from=${input.from} size=${input.size} entrySize=${input.entrySize}`,
    );

    const body: Record<string, unknown> = {
      from: input.from,
      size: input.size,
      entrySize: input.entrySize,
    };
    if (patentNumber) body.patentNumber = patentNumber;
    if (companyName) body.companyName = companyName;
    if (caseNumber) body.caseNumber = caseNumber;

    return ctx.client.post("/api/v3/pacer", body);
  },
};
