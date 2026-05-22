# pangolinfo-mcp

MCP (Model Context Protocol) server that exposes Pangolinfo scrape APIs
(Amazon search, product detail, niches, local maps, …) to AI tooling
such as Claude Code, Cursor, Cline and Windsurf.

This package is the **TypeScript MCP server** half of the
`pangolinfo-platform` repo. See [`../CONTRACT.md`](../CONTRACT.md) for
the binding specification — every rule there is enforced in code.

## Status

`v0.1.0` — scaffold only. The reference tool `search_amazon` is wired
up end to end; the remaining 7 tools listed in CONTRACT §8 will land in
follow-up PRs.

## Project layout

```
src/
├── server.ts          MCP stdio entry point + tool registration
├── auth.ts            API key resolution (CLI > env > config file)
├── client.ts          HTTP client (injects Authorization, User-Agent)
├── errors.ts          PangolinfoError + http-status mapping
├── config.ts          Default endpoints / constants (CONTRACT §7)
└── tools/
    ├── _types.ts          Tool / ToolContext type definitions
    ├── index.ts           Tool registry
    └── search_amazon.ts   Reference tool implementation
```

## Development

```bash
npm install
npm run dev      # tsx src/server.ts (hot-edit friendly)
npm run build    # bundle to dist/server.js with esbuild
npm start        # node dist/server.js
npm run typecheck
```

Node 18 or newer is required (built-in `fetch`).

## Auth

The server resolves the API key with this priority (CONTRACT §3):

1. CLI args: `--api-key=pgl_xxx --api-base=... --scrape-base=...`
2. Env vars: `PANGOLINFO_API_KEY`, `PANGOLINFO_API_BASE`, `PANGOLINFO_SCRAPE_BASE`
3. Config file: `~/.pangolinfo/config.json`
   ```json
   {
     "api_key": "pgl_xxxxxxxxxxxx",
     "api_base": "https://extapi.pangolinfo.com",
     "scrape_base": "https://scrapeapi.pangolinfo.com"
   }
   ```
4. Missing key → startup failure with an actionable message.

The installer (separate package) writes the config file. The MCP
server only ever uses `scrape_base`.

## Wiring into Claude Code (dev)

Add an entry to your `mcp.json` (or the Claude Code settings UI) that
points at a built or dev server.

Using the built binary:

```json
{
  "mcpServers": {
    "pangolinfo": {
      "command": "node",
      "args": ["D:/newCode/pangolinfo-platform/pangolinfo-mcp/dist/server.js"],
      "env": {
        "PANGOLINFO_API_KEY": "pgl_xxxxxxxx"
      }
    }
  }
}
```

Using the dev runner (auto-reloads on edit):

```json
{
  "mcpServers": {
    "pangolinfo-dev": {
      "command": "npx",
      "args": [
        "tsx",
        "D:/newCode/pangolinfo-platform/pangolinfo-mcp/src/server.ts",
        "--api-key=pgl_xxxxxxxx"
      ]
    }
  }
}
```

CLI args win over env vars, which is convenient when you want
per-server keys without polluting the global environment.

## Adding a tool

1. Create `src/tools/<verb_noun>.ts` exporting a `Tool` object
   (mirror `search_amazon.ts`).
2. Import it in `src/tools/index.ts` and append to the `tools` array.
3. The schema is `zod`; `describe()` every field — the AI reads
   those descriptions.
4. Never call `fetch` directly — use `ctx.client.post(...)`. Never
   read env vars from a tool — `auth.ts` already handled that.
5. Throw `PangolinfoError` on failure (the HTTP client already does
   this for non-2xx responses).

## Contract

The single source of truth is [`../CONTRACT.md`](../CONTRACT.md). If
this README and the contract ever disagree, the contract wins — open
an issue.
