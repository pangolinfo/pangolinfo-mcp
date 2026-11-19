/**
 * Pangolinfo MCP - result finalisation.
 *
 * The one place that turns a tool's return value into the text block the
 * client sees. Two regimes, because the two kinds of payload cost
 * opposite things when squeezed:
 *
 *  - Page content: a whole rendered page, either as a plain string body
 *    (`client.ts` returns the body unwrapped when it is not JSON) or as
 *    the payload of a `format: "markdown"` call (a JSON envelope whose
 *    data field holds the page text). A page is not a dataset — cutting
 *    it loses no record and it can be fetched again — so it is capped and
 *    the cut is annotated.
 *
 *  - Structured data: billed per record by the backend, and we keep no
 *    server-side copy. Never truncate. The user has already paid and
 *    could not re-read whatever we dropped. If it is very large we still
 *    return every byte and warn the model not to re-request.
 */

import { t } from "./i18n.js";
import { fenceUntrusted } from "./untrusted.js";

/** Cap for page text (~15k tokens). Bright Data uses 40,000. */
export const MAX_PAGE_CHARS = 60_000;

/** Above this a structured payload gets a warning — but is returned whole. */
export const WARN_OVER_CHARS = 200_000;

export interface FinalResult {
  text: string;
  /** Set only when page content was cut. */
  truncated?: { kept: number; total: number };
  /** Set when structured data exceeded WARN_OVER_CHARS. */
  oversized?: boolean;
  /** Separate from text so the first MCP content block stays valid JSON. */
  warning?: string;
}

export interface FinalizeOptions {
  /**
   * The tool was called with `format: "markdown"` (or the body arrived as
   * non-JSON text), so the payload is page content rather than records.
   */
  pageText?: boolean;
}

function cutNote(kept: number, total: number): string {
  return t({
    zh: `\n\n[注意] 网页正文过长，已保留前 ${kept} / ${total} 字符。需要后面的内容请缩小抓取范围（例如只指定某个区块）后重新请求。`,
    en: `\n\n[NOTE] The page body was too long; kept the first ${kept} of ${total} characters. To read further, narrow the request (e.g. target a specific section) and fetch again.`,
  });
}

function finalizePageText(page: string): FinalResult {
  const total = page.length;
  const kept = Math.min(total, MAX_PAGE_CHARS);
  const fenced = fenceUntrusted(kept < total ? page.slice(0, kept) : page);
  if (kept >= total) return { text: fenced };
  // The note is ours, not the page's — it goes outside the fence.
  return { text: fenced + cutNote(kept, total), truncated: { kept, total } };
}

/**
 * Markdown/raw page payloads arrive inside the normal JSON envelope
 * (`data.json[0].data` holds the rendered page), so a length check on the
 * top-level string never fires for them. Walk the value and treat any
 * long string leaf as page text: fence it and cap it in place. The
 * envelope stays parseable JSON, and short leaves (keyword, url, message,
 * status_code) are metadata, never page text, so they are left alone.
 */
const MIN_PAGE_LEAF_CHARS = 1_000;

function finalizePageObject(value: unknown, state: { truncated?: { kept: number; total: number } }): unknown {
  if (typeof value === "string") {
    const total = value.length;
    if (total < MIN_PAGE_LEAF_CHARS) return value;
    if (total <= MAX_PAGE_CHARS) return fenceUntrusted(value);
    state.truncated ??= { kept: MAX_PAGE_CHARS, total };
    return fenceUntrusted(value.slice(0, MAX_PAGE_CHARS)) + cutNote(MAX_PAGE_CHARS, total);
  }
  if (Array.isArray(value)) return value.map((item) => finalizePageObject(item, state));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, finalizePageObject(item, state)]),
    );
  }
  return value;
}

function finalizeStructured(value: unknown): FinalResult {
  // Pretty-print once and measure exactly what will be sent — measuring a
  // compact serialisation would undercount by the indentation.
  const text = JSON.stringify(value, null, 2) ?? "null";
  if (text.length <= WARN_OVER_CHARS) return { text };
  const warning = t({
    zh:
      `[注意] 本次结果约 ${text.length} 字符，已完整返回。请直接用返回的数据做摘要或提取，避免重复请求产生额外费用。`,
    en:
      `[NOTE] This result contains ~${text.length} characters and is returned in full. Use the returned data to summarise or extract what you need and avoid repeat charges.`,
  });
  return { text, oversized: true, warning };
}

export function finalizeResult(result: unknown, options: FinalizeOptions = {}): FinalResult {
  if (typeof result === "string") return finalizePageText(result);
  if (options.pageText) {
    const state: { truncated?: { kept: number; total: number } } = {};
    const walked = finalizePageObject(result, state);
    const out: FinalResult = { text: JSON.stringify(walked, null, 2) ?? "null" };
    if (state.truncated) out.truncated = state.truncated;
    return out;
  }
  return finalizeStructured(result);
}
