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
import { PangolinfoError, codeFromHttpStatus, codeFromBizCode } from "./errors.js";

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

    // Client-side hard timeout. Bare fetch has none, so when the backend
    // hangs the agent's connection just dangles until ITS own socket
    // timeout fires — surfacing as an opaque "长连接失败 / SSE 链接错误 /
    // 连不上" with no [CODE] or hint. We abort first and translate it into
    // a clean, retriable [NETWORK] error.
    //
    // The deadline is derived from the backend `timeout` the tool already
    // asked for (slow tools pass body.timeout = 60s..240s) plus a margin,
    // so we always give the backend a chance to return its OWN structured
    // error before we pull the plug. Tools without a body.timeout (the
    // amzscope filter/category endpoints) get the DEFAULT_FLOOR.
    const deadlineMs = deriveTimeoutMs(body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadlineMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      // Distinguish our own deadline abort from a genuine transport error:
      // an aborted fetch throws an AbortError. Both map to NETWORK (both
      // retriable), but the message must tell the AI which one happened so
      // it doesn't, e.g., tell the user to "check your internet" on a
      // server-side slow render.
      const aborted =
        controller.signal.aborted ||
        (err instanceof Error && err.name === "AbortError");
      if (aborted) {
        throw new PangolinfoError(
          "NETWORK",
          0,
          `请求超时:${method} ${path} 超过 ${Math.round(deadlineMs / 1000)}s 未返回(可重试)。` +
            `Request timed out after ${Math.round(deadlineMs / 1000)}s (retriable). ` +
            `This is a slow/stuck backend render, not your local network — retry, or reduce scope (e.g. fewer pages / simpler query).`,
          { method, path, deadlineMs, reason: "timeout" },
        );
      }
      throw new PangolinfoError(
        "NETWORK",
        0,
        `网络错误:无法连接 ${method} ${path}(可重试)。` +
          `Network error calling ${method} ${path}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        { method, path, cause: err, reason: "network" },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const code = codeFromHttpStatus(res.status);
      const text = await safeReadText(res);
      // Human-first message; raw HTTP status / path / body kept in details
      // for logs, not dumped into the first line the AI reads.
      throw new PangolinfoError(
        code,
        res.status,
        text || res.statusText || `HTTP ${res.status}`,
        { httpStatus: res.status, method, path, body: text },
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
      // Human-first message (the backend's own message), classified by the
      // explicit bizCode table in errors.ts. Raw bizCode / path go to
      // details for logs — the AI reads the [CODE] tag + hint instead.
      throw new PangolinfoError(
        codeFromBizCode(env.code),
        res.status,
        env.message ?? `Backend error ${env.code}`,
        { bizCode: env.code, bizMessage: env.message, pointCost: env.pointCost, method, path, data: env.data },
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
 * Client-side abort deadline for a request, in ms.
 *
 * Rule: always longer than the backend's own per-task timeout so the
 * backend can return its structured error first. If the request body
 * carries a numeric `timeout` (ms — the slow scrape/AI tools set this),
 * use it + MARGIN. Otherwise use a floor that comfortably covers the
 * fast amzscope/category endpoints. Capped so a bad body.timeout can't
 * make us hang for an absurd duration.
 */
function deriveTimeoutMs(body: unknown): number {
  const MARGIN_MS = 30_000; // headroom over the backend deadline
  const DEFAULT_FLOOR_MS = 45_000; // no body.timeout → fast endpoints
  const HARD_CAP_MS = 300_000; // never wait more than 5 min, whatever the body says

  let backend = 0;
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { timeout?: unknown }).timeout === "number"
  ) {
    backend = (body as { timeout: number }).timeout;
  }

  const derived = backend > 0 ? backend + MARGIN_MS : DEFAULT_FLOOR_MS;
  return Math.min(Math.max(derived, DEFAULT_FLOOR_MS), HARD_CAP_MS);
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
