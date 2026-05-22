/**
 * Pangolinfo MCP - server entry point.
 *
 * Boots a stdio MCP server, loads auth, creates the HTTP client,
 * builds a ToolContext, and registers every tool from
 * `tools/index.ts` with the MCP SDK.
 *
 * Per CONTRACT.md §5 — when a tool throws `PangolinfoError`, we
 * translate it into the structured `{ isError: true, content: [...] }`
 * envelope before returning to the MCP runtime.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
import { PangolinfoError, hintFor } from "./errors.js";
import { tools } from "./tools/index.js";
import type { Tool, ToolContext, ToolLogger } from "./tools/_types.js";

/** Logger that writes to stderr — stdout is reserved for the MCP protocol. */
const logger: ToolLogger = {
  info(msg) {
    process.stderr.write(`[pangolinfo-mcp] ${msg}\n`);
  },
  error(msg, err) {
    const suffix = err ? `: ${err.stack ?? err.message}` : "";
    process.stderr.write(`[pangolinfo-mcp][error] ${msg}${suffix}\n`);
  },
};

async function main(): Promise<void> {
  // i18n auto-init already ran on module load; log the resolved locale
  // (kept in English per CONTRACT-i18n.md §1.1 — startup logs are
  // developer-facing).
  logger.info(`locale=${getLocale()}`);

  const auth = loadAuth();
  logger.info(
    `auth loaded from ${auth.source}; scrape_base=${auth.scrapeBase}`,
  );

  const client = new PangolinfoClient({
    apiKey: auth.apiKey,
    baseUrl: auth.scrapeBase,
  });

  const ctx: ToolContext = { client, logger };
  const toolsByName = new Map<string, Tool>(tools.map((t) => [t.name, t]));

  const server = new Server(
    {
      name: "pangolinfo-mcp",
      version: "0.1.0",
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`server connected; ${tools.length} tool(s) registered.`);
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

  // Zod validation errors and any other unexpected throw.
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

main().catch((err) => {
  logger.error("fatal startup error", err instanceof Error ? err : undefined);
  process.exit(1);
});
