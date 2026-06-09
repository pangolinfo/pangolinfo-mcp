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
    const tool = toolsByName.get(req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `[BAD_INPUT] Unknown tool: ${req.params.name}`,
          },
        ],
      };
    }

    try {
      const parsed = tool.inputSchema.parse(req.params.arguments ?? {});
      const result = await tool.execute(parsed, ctx);
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
      return toErrorEnvelope(err, tool.name);
    }
  });

  return server;
}

function toErrorEnvelope(err: unknown, toolName: string) {
  if (err instanceof PangolinfoError) {
    logger.error(`tool ${toolName} failed [${err.code}]`, err);
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `[${err.code}] ${err.message}\n${hintFor(err.code)}`,
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
        text: `[BAD_INPUT] ${message}`,
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
      writeJson(res, 401, {
        error: "AUTH",
        message:
          "API key required. Pass via ?api_key=pgl_xxx in the URL or " +
          "Authorization: Bearer pgl_xxx header. " +
          "Get a key at https://extapi.pangolinfo.com.",
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
    const ctx: ToolContext = { client, logger: requestLogger };
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
          message: err instanceof Error ? err.message : String(err),
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
