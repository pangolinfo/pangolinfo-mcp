/**
 * Pangolinfo MCP - HTTP client.
 *
 * Per CONTRACT.md §4 — ALL outbound HTTP goes through this class.
 * Tools call `ctx.client.post(path, body)` and do not touch fetch
 * directly. Auth headers are injected here, never in tool files.
 *
 * Uses Node 18+ built-in global `fetch`.
 */

import { CONFIG } from "./config.js";
import { PangolinfoError, codeFromHttpStatus } from "./errors.js";

export interface PangolinfoClientOptions {
  apiKey: string;
  /** Base URL for scrape endpoints (CONTRACT §3 — MCP only uses scrape_base). */
  baseUrl: string;
  /** Optional fetch impl override, primarily for tests. */
  fetchImpl?: typeof fetch;
}

export class PangolinfoClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: PangolinfoClientOptions) {
    this.apiKey = opts.apiKey;
    // Strip trailing slash so we can safely concatenate.
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": CONFIG.USER_AGENT,
    };
  }

  async post(path: string, body: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async get(path: string): Promise<unknown> {
    return this.request("GET", path);
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new PangolinfoError(
        "NETWORK",
        0,
        `Network error calling ${method} ${path}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err },
      );
    }

    if (!res.ok) {
      const code = codeFromHttpStatus(res.status);
      const text = await safeReadText(res);
      throw new PangolinfoError(
        code,
        res.status,
        `HTTP ${res.status} from ${method} ${path}: ${text || res.statusText}`,
        { body: text },
      );
    }

    // Endpoints are documented as JSON; tolerate empty bodies as null.
    const text = await safeReadText(res);
    if (!text) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Some endpoints may stream non-JSON; return raw text so tools
      // can decide. Real production code should pin this per-tool.
      return text;
    }

    // Pangolinfo backend returns business errors as HTTP 200 with a
    // non-zero `code` in the JSON envelope (e.g. rate-limit -> 4029,
    // Akamai challenge -> 9200, no-other-sellers -> 9201). Without
    // this check the AI would interpret `{code: 4029, data: null}`
    // as a successful empty result, which is exactly what the
    // backend's 0-pointCost + non-zero-code semantics are trying to
    // signal against. Translate non-zero biz codes to PangolinfoError
    // so the server layer surfaces them as `isError: true` to the AI.
    if (isErrorEnvelope(parsed)) {
      const env = parsed as BackendEnvelope;
      throw new PangolinfoError(
        codeFromBizCode(env.code),
        res.status,
        `Backend error ${env.code} from ${method} ${path}: ${env.message ?? "(no message)"}`,
        { bizCode: env.code, bizMessage: env.message, pointCost: env.pointCost, data: env.data },
      );
    }

    return parsed;
  }
}

/**
 * Shape of the Pangolinfo backend response envelope. Only `code` is
 * load-bearing; everything else is best-effort.
 */
interface BackendEnvelope {
  code: number;
  message?: string;
  pointCost?: number;
  data?: unknown;
}

/**
 * True iff the parsed body looks like a Pangolinfo backend envelope
 * with a non-zero (= error) `code`. Returning false for non-envelope
 * shapes (e.g. raw arrays from some endpoints) keeps us conservative —
 * better to surface a confusing payload to the AI than to throw on a
 * shape we don't recognize.
 */
function isErrorEnvelope(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { code?: unknown }).code === "number" &&
    (body as { code: number }).code !== 0
  );
}

/**
 * Map a Pangolinfo business error code to our 6-class PangolinfoError
 * taxonomy. The translation is intentionally coarse — the AI only
 * needs to know "should I retry / change input / give up", and the
 * original `bizCode` is preserved on the error's `details`.
 *
 * See ext-scrapeapi/src/main/java/com/dml/ext/scrape/exception/ErrorCode.java
 * for the source of truth; mappings here track that enum.
 */
function codeFromBizCode(bizCode: number): import("./errors.js").PangolinfoErrorCode {
  // Auth / quota / rate-limit: backend uses the 4xxx range mirroring HTTP.
  if (bizCode === 4001 || bizCode === 4003) return "AUTH";
  if (bizCode === 4002) return "AUTH"; // IP_DENIED
  if (bizCode === 4029) return "RATE_LIMIT"; // TOO_MANY_REQUESTS (also returned for upstream Amazon rate-limit)
  if (bizCode >= 4000 && bizCode < 5000) return "BAD_INPUT";

  // Server-side scrape semantics: 9200/9201 are "scrape succeeded
  // technically but no usable content" — for the AI this is effectively
  // a transient SERVER error it can retry (already refunded by backend).
  if (bizCode === 9200) return "SERVER"; // SCRAPE_NO_CONTENT (incl. Akamai challenge)
  if (bizCode === 9201) return "BAD_INPUT"; // SCRAPE_NO_OTHER_SELLERS — ASIN truly has no other sellers
  if (bizCode >= 9000 && bizCode < 10000) return "SERVER";

  // 5xxx system errors.
  if (bizCode >= 5000 && bizCode < 6000) return "SERVER";

  // Catch-all (incl. UNKNOWN=9999).
  return "SERVER";
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
