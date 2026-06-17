/**
 * Pangolinfo MCP - structured error type.
 *
 * Per CONTRACT.md §5 — every error returned to the AI must be a
 * `PangolinfoError`. The MCP server layer is responsible for
 * translating these into the `{ isError: true, content: [...] }`
 * envelope. Tool authors only throw; they never construct the envelope.
 *
 * Design goal (防呆): the text the AI sees must answer three questions
 * without the AI having to guess:
 *   1. What kind of problem is this?         → the [CODE] tag
 *   2. Should I retry, or is retrying futile? → `retriable`
 *   3. What should the *user* do about it?    → the action line (with
 *      the website URL for AUTH/QUOTA, so the AI can tell the user
 *      exactly where to go).
 *
 * Raw transport noise (`HTTP 401 from POST /api/...`, backend bizCode)
 * is kept OUT of the first line the AI reads and pushed into `details`
 * for logging only.
 */

import { CONFIG } from "./config.js";
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

  /**
   * Whether retrying the SAME call (same input, same key) could plausibly
   * succeed. AUTH/QUOTA/BAD_INPUT are terminal — retrying wastes calls and
   * is exactly the behaviour customers complain about ("agent 瞎重试").
   * RATE_LIMIT/SERVER/NETWORK are transient.
   */
  get retriable(): boolean {
    return isRetriable(this.code);
  }
}

/**
 * Map an HTTP status code to a PangolinfoError code.
 * Used by the HTTP client to wrap genuinely non-2xx responses (network
 * proxies, gateways). Note the Pangolinfo backend itself returns business
 * errors as HTTP 200 + non-zero `code` — those go through
 * `codeFromBizCode`, NOT here.
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
 * Map a Pangolinfo backend business error code to our 6-class taxonomy.
 *
 * SOURCE OF TRUTH — this table is transcribed verbatim from
 *   crawler-ext-service/ext-scrapeapi/src/main/java/com/dml/ext/scrape/exception/ErrorCode.java
 * Do NOT guess by numeric range. The backend's ranges do NOT line up with
 * HTTP semantics — e.g. an invalid API key is bizCode 1004 (in the "1xxx
 * 参数异常" block), NOT 401 and NOT a 4xxx code. The previous
 * range-guessing implementation mapped 1004 → SERVER, so a customer with a
 * bad key saw "[SERVER] 服务端错误" and the AI never told them to fix the
 * key. This explicit table is the防呆 fix.
 *
 * The original `bizCode` is always preserved on the error's `details` for
 * logs; the AI only needs the coarse class + the hint.
 */
export function codeFromBizCode(bizCode: number): PangolinfoErrorCode {
  switch (bizCode) {
    // 1xxx 参数异常 — note INVALID_TOKEN lives here, not in an auth range.
    case 1004: // INVALID_TOKEN
      return "AUTH";
    case 1001: // PARAM_IS_NULL
    case 1002: // INVALID_PARAM
    case 1005: // CAPTCHA_ERR
    case 1008: // UNSUPPORTED_SITE
    case 1009: // INVALID_PARSER_NAME
    case 1010: // INVALID_API_NAME
    case 1011: // UNSUPPORTED_ZIPCODE
    case 1012: // ASYNC_PROXY_NOT_SUPPORT_REVIEW
      return "BAD_INPUT";
    case 1003: // DUPLICATE_REQUEST — transient, safe to retry
      return "RATE_LIMIT";

    // 2xxx 账户异常 — all quota/plan related; retrying never helps.
    case 2000: // ACCOUNT_NOT_EXIST
      return "AUTH";
    case 2001: // BALANCE_INSUFFICIENT
    case 2005: // ACCOUNT_NOT_HAVE_VALID_SETMEAL
    case 2007: // ACCOUNT_ALREADY_EXPIRED
    case 2008: // ACCOUNT_HAS_VALID_SETMEAL
    case 2009: // USAGE_LIMIT_EXCEEDED
    case 2010: // ACCOUNT_BILL_DAY_MISSING
      return "QUOTA";

    // 3xxx 用户模块
    case 3000: // USER_NOT_FOUND
    case 3001: // USERNAME_OR_PASSWORD_ERROR
    case 3002: // AUTH_FAIL
    case 3003: // USER_NOT_LOGIN
      return "AUTH";

    // 4xxx 权限/限流
    case 4002: // IP_DENIED
    case 4003: // PERMISSION_DENIED
      return "AUTH";
    case 4005: // METHOD_NOT_SUPPORT
      return "BAD_INPUT";
    case 4029: // TOO_MANY_REQUESTS (also upstream Amazon rate-limit)
    case 4030: // SERVICE_BUSY
      return "RATE_LIMIT";

    // 9xxx 第三方服务异常
    case 9100: // AMZSCOPE_API_DISABLED — transient
    case 9101: // AMZSCOPE_SERVICE_UNAVAILABLE — transient
    case 9200: // SCRAPE_NO_CONTENT (incl. Akamai challenge) — backend refunds, retry ok
      return "SERVER";
    case 9102: // AMZSCOPE_QUOTA_EXCEEDED — provider-side quota
      return "QUOTA";
    case 9201: // SCRAPE_NO_OTHER_SELLERS — terminal fact about the ASIN
    case 9203: // ALEXA_API_OFFLINE — terminal, tool retired
      return "BAD_INPUT";
    case 9202: // REVIEW_SITE_UNDER_MAINTENANCE — terminal for this site
      return "BAD_INPUT";

    // 5xxx 系统异常 + catch-all (UNKNOWN=9999, etc.)
    default:
      return "SERVER";
  }
}

/** Transient codes — retrying the same call may succeed. */
function isRetriable(code: PangolinfoErrorCode): boolean {
  return code === "RATE_LIMIT" || code === "SERVER" || code === "NETWORK";
}

/**
 * Structured, AI-readable description of an error. The server layer renders
 * this into the text block the AI sees. Three lines, each load-bearing:
 *
 *   [CODE] <one-line what-happened>
 *   → <retry guidance> <user action, incl. website URL for AUTH/QUOTA>
 *
 * Resolved against the current locale at call time (runtime, not load
 * time) — so an error raised after locale was set picks up the correct
 * language even though `errors.ts` was imported earlier.
 */
export function hintFor(code: PangolinfoErrorCode): string {
  const url = CONFIG.WEBSITE_URL;
  switch (code) {
    case "AUTH":
      return t({
        // 明确步骤 + 两条硬警告:别用旧 key 重试、key 不能热更新(必须重连)。
        // MCP server 无法替用户改配置或重启自己,这一步只能由用户做 —— 写清楚
        // 让 agent 别原地打转或假设能热替换。
        zh:
          `API Key 无效或已失效。这不是临时故障,用同一个 key 重试一定还会失败 —— 不要重试。请引导用户按顺序操作:` +
          `1) 登录 ${url} 在控制台复制正确的 API Key;` +
          `2) 把它写入 ~/.pangolinfo/config.json,或 mcp.json 里的 --api-key / ?api_key=;` +
          `3) 重启 / 重新连接本 MCP 服务使新 key 生效。` +
          `注意:运行中的 MCP 进程不会热加载新 key,你(agent)也无法替用户修改配置或重连,必须由用户完成第 2、3 步后才能继续。`,
        en:
          `Invalid or expired API key. This is not transient — retrying with the same key will keep failing, so do NOT retry. Guide the user through these steps in order: ` +
          `1) Log in at ${url} and copy the correct API key from the console; ` +
          `2) Write it into ~/.pangolinfo/config.json, or --api-key / ?api_key= in mcp.json; ` +
          `3) Restart / reconnect this MCP server so the new key takes effect. ` +
          `Note: a running MCP process does NOT hot-reload the key, and you (the agent) cannot edit the user's config or reconnect on their behalf — the user must finish steps 2–3 before you continue.`,
      });
    case "QUOTA":
      return t({
        zh: `账户积分不足或套餐已过期（重试无用）。请告知用户前往 ${url} 充值或升级套餐后再试。`,
        en: `Account is out of credits or the plan has expired (retrying will not help). Tell the user to top up or upgrade their plan at ${url}, then try again.`,
      });
    case "RATE_LIMIT":
      return t({
        zh: "调用频率过高（临时）。请降低 QPS，稍候几秒后重试同一请求即可。",
        en: "Rate limited (transient). Reduce QPS and retry the same request after a few seconds.",
      });
    case "BAD_INPUT":
      return t({
        zh: "请求参数有误（重试相同参数无用）。请检查并修正入参（站点、ASIN、zipcode、parserName 等）后重试。",
        en: "Invalid request parameters (retrying the same input will not help). Fix the arguments (site, ASIN, zipcode, parserName, etc.) and try again.",
      });
    case "SERVER":
      return t({
        zh: "服务端临时错误（通常可重试）。请稍候重试；若多次失败请联系 Pangolinfo 支持。",
        en: "Transient server-side error (usually retriable). Retry shortly; if it keeps failing, contact Pangolinfo support.",
      });
    case "NETWORK":
      return t({
        zh: "网络异常（临时）。请检查本地到 pangolinfo.com 的网络连接后重试。",
        en: "Network error (transient). Check local connectivity to pangolinfo.com and retry.",
      });
  }
}
