/**
 * Pangolinfo MCP - server entry point.
 *
 * Two transports supported, selected by argv / env:
 *
 *   1. stdio (default) — single user, single process. The AI client
 *      forks this binary, talks JSON-RPC over stdin/stdout. API key
 *      resolved once at boot from --api-key / env / config file.
 *
 *   2. HTTP / streamable (--transport=http or PANGOLINFO_TRANSPORT=http) —
 *      multi-tenant. Process stays up, accepts POST /mcp with the
 *      caller's API key in the URL query string (`?api_key=pgl_xxx`)
 *      or the `Authorization: Bearer pgl_xxx` header. Each request
 *      builds its own PangolinfoClient + Server instance so two users
 *      never share auth state.
 *
 * In both modes, tool registration is identical — `buildServer(ctx)`
 * wires the same Server with the same 17 tools and the same error
 * envelope semantics.
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z, ZodError } from "zod";

// NOTE: i18n MUST be imported before tools/index — the i18n module
// auto-detects locale in a top-level IIFE so that tool files (which
// resolve `t({zh,en})` at their own top level) see the correct locale
// by the time they're evaluated. Keeping it as the first local import
// makes the ordering explicit. See CONTRACT-i18n.md §2.2.
import { getLocale } from "./i18n.js";
import { loadAuth } from "./auth.js";
import { PangolinfoClient } from "./client.js";
import { CONFIG } from "./config.js";
import { PangolinfoError, hintFor } from "./errors.js";
import { tools } from "./tools/index.js";
import type { Tool, ToolContext, ToolLogger } from "./tools/_types.js";
import { SERVER_VERSION } from "./version.js";

/** Logger that writes to stderr — stdout is reserved for the stdio MCP protocol. */
const logger: ToolLogger = {
  info(msg) {
    process.stderr.write(`[pangolinfo-mcp] ${msg}\n`);
  },
  error(msg, err) {
    const suffix = err ? `: ${err.stack ?? err.message}` : "";
    process.stderr.write(`[pangolinfo-mcp][error] ${msg}${suffix}\n`);
  },
};

/**
 * Wire a Server instance against a given ToolContext (which carries the
 * client+logger). Identical behavior across transports — separating this
 * out lets the HTTP path build a fresh Server-per-request with the
 * caller's API key, while stdio builds it once at boot.
 */
function buildServer(ctx: ToolContext): Server {
  const toolsByName = new Map<string, Tool>(tools.map((t) => [t.name, t]));

  const server = new Server(
    {
      name: "pangolinfo-mcp",
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema, {
        $refStrategy: "none",
      }) as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const reqId = nextReqId();
    const keyTag = ctx.keyTag ?? "stdio";
    const toolName = req.params.name;
    const rawArgs = req.params.arguments ?? {};
    const startedAt = process.hrtime.bigint();

    const tool = toolsByName.get(toolName);
    if (!tool) {
      logCall({ reqId, keyTag, tool: toolName, args: rawArgs, ms: 0, code: "BAD_INPUT" });
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `[BAD_INPUT] Unknown tool: ${toolName}`,
          },
        ],
      };
    }

    // Validate input ourselves (safeParse) so a schema failure becomes a
    // human-readable [BAD_INPUT] the AI can act on — naming the offending
    // field, the rule it broke, and the field's own description — instead
    // of a raw ZodError JSON blob the AI can't parse into a fix.
    const validation = tool.inputSchema.safeParse(rawArgs);
    if (!validation.success) {
      logCall({
        reqId,
        keyTag,
        tool: toolName,
        args: rawArgs,
        ms: elapsedMs(startedAt),
        code: "BAD_INPUT",
      });
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              `[BAD_INPUT] ${formatZodError(validation.error, tool)}\n` +
              `${hintFor("BAD_INPUT")}\n(retriable=no)\n(ref=${reqId})`,
          },
        ],
      };
    }

    try {
      const parsed = validation.data;
      const result = await tool.execute(parsed, ctx);
      logCall({
        reqId,
        keyTag,
        tool: toolName,
        args: rawArgs,
        ms: elapsedMs(startedAt),
        code: "OK",
      });
      return {
        content: [
          {
            type: "text" as const,
            text:
              typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const code = err instanceof PangolinfoError ? err.code : "BAD_INPUT";
      logCall({
        reqId,
        keyTag,
        tool: toolName,
        args: rawArgs,
        ms: elapsedMs(startedAt),
        code,
      });
      return toErrorEnvelope(err, toolName, reqId);
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Structured call logging. One JSON line per tool invocation to stderr, which
// in HTTP mode lands in the pod log (kubectl logs / log platform). Lets us
// answer "which customer called which tool with what args, and what happened"
// when a user reports a problem — the gap that made support triage painful.
//
// `reqId` correlates the MCP-side log line with the backend's own
// ThirdPartyApiCallLog (billing) record. Args are logged in FULL (not
// truncated) per product decision — payloads here carry no secrets.
// ---------------------------------------------------------------------------

let reqCounter = 0;
function nextReqId(): string {
  // Monotonic per-process id. Avoids Date.now()/Math.random() (unavailable
  // in some sandboxes) and is enough to correlate within a pod's lifetime.
  reqCounter += 1;
  return `r${reqCounter.toString(36)}`;
}

function elapsedMs(startedAt: bigint): number {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}

interface CallLogFields {
  reqId: string;
  keyTag: string;
  tool: string;
  args: unknown;
  ms: number;
  code: string;
}

function logCall(f: CallLogFields): void {
  let line: string;
  try {
    line = JSON.stringify({
      t: "call",
      reqId: f.reqId,
      key: f.keyTag,
      tool: f.tool,
      args: f.args,
      ms: f.ms,
      code: f.code,
    });
  } catch {
    // args may contain a circular structure (shouldn't, but be safe) —
    // never let logging throw and break the actual tool response.
    line = JSON.stringify({
      t: "call",
      reqId: f.reqId,
      key: f.keyTag,
      tool: f.tool,
      args: "[unserializable]",
      ms: f.ms,
      code: f.code,
    });
  }
  process.stderr.write(`${line}\n`);
}

/**
 * Render a ZodError into AI-actionable text. For each failing field:
 *   - the dotted path (`followups[2]`, `nicheTitle`)
 *   - Zod's own rule message ("ASIN must be 10 ...", "Invalid enum value ...")
 *   - the field's `.describe()` so the AI sees what a VALID value looks like
 *
 * All content comes from the tool's schema itself — no rules invented here.
 * If the schema's constraint changes, this text changes with it.
 */
function formatZodError(error: ZodError, tool: Tool): string {
  // Pull the per-field description map from the tool's top-level object
  // shape. Tools all use z.object({...}) with .describe() on each field.
  const shape =
    tool.inputSchema instanceof z.ZodObject
      ? (tool.inputSchema.shape as Record<string, z.ZodTypeAny>)
      : {};

  const lines = error.issues.map((issue) => {
    const pathStr = issue.path.length ? issue.path.join(".") : "(root)";
    const topField = issue.path[0];
    let descHint = "";
    if (typeof topField === "string" && shape[topField]) {
      const desc = shape[topField].description;
      if (desc) {
        // Keep it short — first sentence / up to ~140 chars — so a long
        // bilingual describe doesn't drown the actual error.
        const firstSentence = desc.split(/[。.\n]/)[0]?.trim() ?? "";
        const clipped =
          firstSentence.length > 140
            ? `${firstSentence.slice(0, 140)}…`
            : firstSentence;
        if (clipped) descHint = `（该参数说明：${clipped}）`;
      }
    }
    return `参数 ${pathStr}：${issue.message}${descHint}`;
  });

  return (
    `${tool.name} 入参校验失败 / invalid arguments：\n` +
    lines.map((l) => `  • ${l}`).join("\n")
  );
}

function toErrorEnvelope(err: unknown, toolName: string, reqId?: string) {
  // A trailing reference line lets a confused user quote `ref=…` to support,
  // which we can grep against the call log. Omitted when no reqId (defensive).
  const ref = reqId ? `\n(ref=${reqId})` : "";

  if (err instanceof PangolinfoError) {
    logger.error(`tool ${toolName} failed [${err.code}]`, err);
    // Line 1: [CODE] + human-first message. Line 2: hint with retry guidance
    // + user action. Line 3: an explicit retriable flag so the AI doesn't have
    // to infer whether to retry.
    const retry = err.retriable ? "retriable=yes" : "retriable=no";
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `[${err.code}] ${err.message}\n${hintFor(err.code)}\n(${retry})${ref}`,
        },
      ],
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  logger.error(
    `tool ${toolName} failed unexpectedly`,
    err instanceof Error ? err : undefined,
  );
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `[BAD_INPUT] ${message}\n${hintFor("BAD_INPUT")}\n(retriable=no)${ref}`,
      },
    ],
  };
}

/**
 * Detect the transport from argv (`--transport=http`) or env
 * (PANGOLINFO_TRANSPORT=http). stdio is the default for back-compat
 * with every existing AI client install.
 */
function detectTransport(): "stdio" | "http" {
  const fromArg = process.argv.find((a) => a.startsWith("--transport="));
  if (fromArg) {
    const v = fromArg.split("=")[1]?.toLowerCase();
    if (v === "http" || v === "stdio") return v;
  }
  const fromEnv = process.env.PANGOLINFO_TRANSPORT?.toLowerCase();
  if (fromEnv === "http" || fromEnv === "stdio") return fromEnv;
  return "stdio";
}

/**
 * Extract the per-request API key from either:
 *   - `?api_key=pgl_xxx` URL query parameter (Sorftime-style, easiest)
 *   - `Authorization: Bearer pgl_xxx` header (more professional)
 *
 * The `Bearer` scheme is matched case-INSENSITIVELY per RFC 7235 §2.1
 * ("auth-scheme" is case-insensitive). Many agents/HTTP libraries emit
 * lowercase `bearer ` or uppercase `BEARER `; rejecting those caused
 * spurious 401s even when the caller's key was perfectly valid — the
 * header was present but silently ignored, so the request fell through
 * to the (absent) URL param. See server.ts auth tests.
 *
 * Returns null if neither is present — caller responds 401.
 */
/**
 * The MCP StreamableHTTP transport requires POST requests to accept both
 * `application/json` and `text/event-stream`. Agents frequently send only
 * one (or none), yielding a confusing 406. Normalize the header in place
 * so the SDK transport is satisfied — callers shouldn't need to know the
 * transport's content-negotiation rules. Only mutates when something is
 * missing; a correct header is left untouched.
 */
function ensureStreamableAccept(req: IncomingMessage): void {
  if (req.method !== "POST") return;
  const raw: string | string[] | undefined = req.headers["accept"];
  const current = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  // NOTE: the SDK checks for the LITERAL substrings "application/json" and
  // "text/event-stream" — it does NOT honor `*/*`. So a client sending
  // `Accept: */*` still gets a 406 unless we add the explicit types.
  // Match the SDK's literal check exactly here.
  const lc = current.toLowerCase();
  const hasJson = lc.includes("application/json");
  const hasSse = lc.includes("text/event-stream");
  if (hasJson && hasSse) return;

  const parts: string[] = [];
  if (current.trim()) parts.push(current.trim());
  if (!hasJson) parts.push("application/json");
  if (!hasSse) parts.push("text/event-stream");
  const fixed = parts.join(", ");

  // Update BOTH header views. The MCP SDK's Node transport delegates to
  // Hono's @hono/node-server, which rebuilds the Web `Request` headers
  // from `req.rawHeaders` (the flat [k0,v0,k1,v1,...] array) and ignores
  // the normalized `req.headers` map entirely. So mutating `req.headers`
  // alone is invisible to the transport — we must patch `rawHeaders` too.
  req.headers["accept"] = fixed;
  const rh = req.rawHeaders;
  let patched = false;
  for (let i = 0; i < rh.length; i += 2) {
    if (rh[i]?.toLowerCase() === "accept") {
      rh[i + 1] = fixed;
      patched = true;
      // Keep scanning: there can be multiple Accept entries; collapsing
      // them all to the fixed value is fine and avoids partial matches.
    }
  }
  if (!patched) {
    rh.push("Accept", fixed);
  }
}

function extractApiKey(req: IncomingMessage): string | null {
  // Authorization header takes precedence (less likely to end up in
  // logs / browser history; for clients that bother to set it).
  const auth = req.headers["authorization"];
  if (typeof auth === "string") {
    // Case-insensitive "bearer" + at least one space, then the token.
    const m = /^bearer\s+(.+)$/i.exec(auth.trim());
    if (m) {
      const k = m[1].trim();
      if (k) return k;
    }
  }

  // Fall back to ?api_key=... in the URL.
  if (req.url) {
    try {
      // req.url is path+query only; pair with a dummy origin so URL parses.
      const u = new URL(req.url, "http://localhost");
      const k = u.searchParams.get("api_key") ?? u.searchParams.get("apiKey");
      if (k) return k;
    } catch {
      /* fallthrough */
    }
  }

  return null;
}

/**
 * Read the request body as a JSON object. Used to parse a single
 * MCP JSON-RPC payload before handing it to the SDK transport.
 *
 * SDK's transport.handleRequest accepts either a raw Node request or
 * a pre-parsed body — we parse here so a malformed body returns a clean
 * 400 instead of dying inside the transport.
 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function startStdio(): Promise<void> {
  // stdio mode: resolve API key once at boot from --api-key / env /
  // config file. Single user, single process.
  const auth = loadAuth();
  logger.info(`auth loaded from ${auth.source}; scrape_base=${auth.scrapeBase}`);
  const client = new PangolinfoClient({
    apiKey: auth.apiKey,
    baseUrl: auth.scrapeBase,
  });
  const ctx: ToolContext = { client, logger };
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`stdio server connected; ${tools.length} tool(s) registered.`);
}

async function startHttp(): Promise<void> {
  // HTTP mode: multi-tenant. One process, many users — each request
  // brings its own API key. No global auth state, no shared client.
  const port = readPort();
  const scrapeBase = process.env.PANGOLINFO_SCRAPE_BASE ?? CONFIG.DEFAULT_SCRAPE_BASE;

  const httpServer = createServer(async (req, res) => {
    // Health endpoint for k8s liveness/readiness probes. No auth.
    if (req.method === "GET" && (req.url === "/health" || req.url === "/healthz")) {
      writeJson(res, 200, {
        status: "ok",
        version: SERVER_VERSION,
        toolCount: tools.length,
      });
      return;
    }

    // Single MCP endpoint. The streamable transport accepts both
    // POST (request/response) and GET (server-initiated SSE stream).
    // We support both methods on /mcp; SDK transport routes internally.
    const isMcpPath = req.url?.startsWith("/mcp") || req.url?.startsWith("/?");
    if (!isMcpPath && req.url !== "/" && !req.url?.startsWith("/?")) {
      writeJson(res, 404, { error: "Not found", hint: "POST /mcp" });
      return;
    }

    // The StreamableHTTP transport (MCP spec) requires the POST `Accept`
    // header to advertise BOTH application/json AND text/event-stream;
    // otherwise it rejects the request with 406. Many agents/HTTP libs
    // send only `Accept: application/json` (or omit Accept entirely),
    // which surfaced to users as an opaque 406. We don't want callers to
    // care about this protocol detail, so we backfill the missing media
    // type here before handing the request to the SDK transport.
    ensureStreamableAccept(req);

    const apiKey = extractApiKey(req);
    if (!apiKey) {
      // Connection-layer AUTH failure (no key reached the server at all).
      // This is the "mcp 服务连接错误 / 401" customers see before any tool
      // runs. Give the AI the same structured shape it gets from tool
      // errors: a class, an explicit non-retriable flag, and a concrete
      // user action with the website URL.
      writeJson(res, 401, {
        error: "AUTH",
        retriable: false,
        message:
          "未提供 API Key —— 请求未携带凭据，重试无用。" +
          "Missing API key. The request carried no credentials; retrying will not help.",
        hint:
          `请在 MCP 配置里加上 API Key(URL 加 ?api_key=pgl_xxx,或 HTTP 头 Authorization: Bearer pgl_xxx),` +
          `然后重启/重新连接本 MCP 服务使其生效 —— 配置不会热加载。没有 Key 请到 ${CONFIG.WEBSITE_URL} 登录获取。 / ` +
          `Add the key in your MCP config (?api_key=pgl_xxx in the URL, or an ` +
          `Authorization: Bearer pgl_xxx header), then restart/reconnect this MCP server for it to take effect — config is not hot-reloaded. Get a key at ${CONFIG.WEBSITE_URL}.`,
      });
      return;
    }

    // Build per-request client/server. No state leakage between callers.
    const requestLogger: ToolLogger = {
      info(msg) {
        // Don't log full keys — last 4 chars only.
        const tag = `k=…${apiKey.slice(-4)}`;
        process.stderr.write(`[pangolinfo-mcp][${tag}] ${msg}\n`);
      },
      error(msg, err) {
        const tag = `k=…${apiKey.slice(-4)}`;
        const suffix = err ? `: ${err.stack ?? err.message}` : "";
        process.stderr.write(`[pangolinfo-mcp][${tag}][error] ${msg}${suffix}\n`);
      },
    };

    const client = new PangolinfoClient({
      apiKey,
      baseUrl: scrapeBase,
    });
    const ctx: ToolContext = {
      client,
      logger: requestLogger,
      keyTag: `…${apiKey.slice(-8)}`,
    };
    const server = buildServer(ctx);

    // Stateless transport: no sessionId, each request is independent.
    // sessionIdGenerator: undefined opts into stateless mode per SDK docs.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    // Wire transport to server and let SDK handle the rest.
    res.on("close", () => {
      // Best-effort cleanup if client disconnects mid-stream.
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      const body = req.method === "POST" ? await readJsonBody(req) : undefined;
      await transport.handleRequest(req, res, body);
    } catch (err) {
      requestLogger.error("handleRequest threw", err instanceof Error ? err : undefined);
      if (!res.headersSent) {
        writeJson(res, 500, {
          error: "SERVER",
          retriable: true,
          message:
            "MCP 服务端临时错误,通常可重试。 / " +
            "Transient MCP server error, usually retriable. " +
            (err instanceof Error ? err.message : String(err)),
        });
      }
    }
  });

  httpServer.listen(port, () => {
    logger.info(
      `http server listening on :${port}; ` +
        `endpoint=/mcp health=/health; ` +
        `${tools.length} tool(s) registered; ` +
        `scrape_base=${scrapeBase}`,
    );
  });

  // Graceful shutdown on SIGTERM (k8s rolling-update sends this).
  const shutdown = (signal: string) => {
    logger.info(`received ${signal}, shutting down...`);
    httpServer.close(() => {
      logger.info("http server closed");
      process.exit(0);
    });
    // Hard kill after 10s if connections won't drain.
    setTimeout(() => {
      logger.error("forced exit after 10s drain timeout");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

function readPort(): number {
  // --port=3000 takes precedence over PORT env (which k8s/PaaS love).
  const fromArg = process.argv.find((a) => a.startsWith("--port="));
  if (fromArg) {
    const n = Number(fromArg.split("=")[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const fromEnv = Number(process.env.PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 3000;
}

async function main(): Promise<void> {
  // i18n auto-init already ran on module load; log the resolved locale.
  logger.info(`locale=${getLocale()} version=${SERVER_VERSION}`);
  const transport = detectTransport();
  logger.info(`transport=${transport}`);

  if (transport === "http") {
    await startHttp();
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  logger.error("fatal startup error", err instanceof Error ? err : undefined);
  process.exit(1);
});
