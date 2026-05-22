/**
 * Pangolinfo MCP - structured error type.
 *
 * Per CONTRACT.md §5 — every error returned to the AI must be a
 * `PangolinfoError`. The MCP server layer is responsible for
 * translating these into the `{ isError: true, content: [...] }`
 * envelope. Tool authors only throw; they never construct the envelope.
 */

import { t } from "./i18n.js";

export type PangolinfoErrorCode =
  | "AUTH"
  | "QUOTA"
  | "RATE_LIMIT"
  | "BAD_INPUT"
  | "SERVER"
  | "NETWORK";

export class PangolinfoError extends Error {
  constructor(
    public code: PangolinfoErrorCode,
    public httpStatus: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "PangolinfoError";
  }
}

/**
 * Map an HTTP status code to a PangolinfoError code.
 * Used by the HTTP client to wrap non-2xx responses.
 */
export function codeFromHttpStatus(status: number): PangolinfoErrorCode {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 402) return "QUOTA";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 400 && status < 500) return "BAD_INPUT";
  if (status >= 500) return "SERVER";
  return "SERVER";
}

/**
 * Hint string returned to the AI alongside the error message,
 * suggesting how to react. Kept short and AI-readable.
 *
 * Resolved against the current locale at call time (runtime, not load
 * time) — so an error raised after locale was set will pick up the
 * correct language even though `errors.ts` was imported earlier.
 */
export function hintFor(code: PangolinfoErrorCode): string {
  switch (code) {
    case "AUTH":
      return t({
        zh: "API Key 无效，请重新运行 installer 或检查 ~/.pangolinfo/config.json。",
        en: "Invalid API key — run the installer again or check ~/.pangolinfo/config.json.",
      });
    case "QUOTA":
      return t({
        zh: "配额不足，请到 pangolinfo.com 升级套餐。",
        en: "Quota exhausted — upgrade your plan at pangolinfo.com.",
      });
    case "RATE_LIMIT":
      return t({
        zh: "调用频率过高，请稍候重试。",
        en: "Rate limited — please retry shortly.",
      });
    case "BAD_INPUT":
      return t({
        zh: "请求参数错误。",
        en: "Invalid request parameters.",
      });
    case "SERVER":
      return t({
        zh: "服务端错误。",
        en: "Server error.",
      });
    case "NETWORK":
      return t({
        zh: "网络异常，请检查本地连接后重试。",
        en: "Network error — check your local connection and retry.",
      });
  }
}
