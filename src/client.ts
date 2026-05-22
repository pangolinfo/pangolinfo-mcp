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
    try {
      return JSON.parse(text);
    } catch {
      // Some endpoints may stream non-JSON; return raw text so tools
      // can decide. Real production code should pin this per-tool.
      return text;
    }
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
