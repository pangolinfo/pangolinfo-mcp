# pangolinfo-mcp

> Pangolinfo MCP server — **19 Amazon e-commerce & IP data tools (1 deprecated)** for AI assistants via [Model Context Protocol](https://modelcontextprotocol.io).

Plug your favorite AI client (Claude Code, Cursor, Cline, Windsurf, Codex, Hermes, OpenClaw) into Pangolinfo's Amazon scrape APIs and let the AI run keyword research, listing analysis, review mining, niche discovery, category navigation, AI search lookups, keyword-trend checks, and WIPO trademark clearance — all from natural-language instructions.

> ⚠️ **BREAKING CHANGE in 0.3.0 — tool renames (no backward-compatible aliases)**
>
> | Old name (≤ 0.2.x) | New name (0.3.0+) |
> | --- | --- |
> | `google_ai_search` | `ai_search` |
> | `google_trends` | `keyword_trends` |
>
> Tool names changed to remove third-party brand references from the public MCP interface. Any prompts, SKILLs, or scripts pinning the old names will get `ToolNotFound` after upgrading. Update your prompts to the new names. Tool parameters, return shape, and pricing are unchanged.

| | |
|---|---|
| **Version** | `0.4.1` |
| **Tools** | 19 (18 backend + 1 self-introspection; 1 deprecated) |
| **Transport** | stdio (MCP standard) |
| **Runtime** | Node.js 18+ |
| **License** | MIT |
| **Get an API key** | <https://tool.pangolinfo.com/> |

---

## Install

### Recommended: one-line installer (covers 7 AI clients)

The Pangolinfo Installer detects your AI client, writes the right config files, and you're done. Pass `--scope=mcp` to install **only** this MCP server (skip the Skills package).

**macOS / Linux**

```bash
curl -fsSL https://pangolinfo.dev/install.sh | sh -s -- \
  --agent=<your-agent> \
  --scope=mcp \
  --api-key=pgl_xxxxxxxxxxxx
```

**Windows (PowerShell)**

```powershell
irm https://pangolinfo.dev/install.ps1 | iex; `
  Install-Pangolinfo -Agent <your-agent> -Scope mcp -ApiKey pgl_xxxxxxxxxxxx
```

`<your-agent>` is one of: `claude-code`, `cursor`, `cline`, `windsurf`, `codex`, `hermes`, `openclaw`.

After the installer finishes, **restart your AI client** so it picks up the new `mcpServers` entry.

### Manual install (just download one file)

The release artifact is a **single self-contained `server.mjs`** (~800 KB) — all dependencies are bundled in. No `npm install` needed.

```bash
# macOS / Linux
mkdir -p ~/.local/lib/pangolinfo-mcp
curl -fsSL https://github.com/pangolinfo/pangolinfo-mcp/releases/latest/download/server.mjs \
  -o ~/.local/lib/pangolinfo-mcp/server.mjs
chmod +x ~/.local/lib/pangolinfo-mcp/server.mjs
```

```powershell
# Windows (PowerShell)
$dir = "$env:LOCALAPPDATA\pangolinfo-mcp"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
irm https://github.com/pangolinfo/pangolinfo-mcp/releases/latest/download/server.mjs `
  -OutFile "$dir\server.mjs"
```

Then wire it into your AI client — see the per-client snippets below. Point `args` at the file you just downloaded.

> **Developers**: to build from source, `git clone` this repo and run `npm install && npm run build`. The produced `dist/server.mjs` is identical to the release asset.

---

## Get an API key

1. Sign up at <https://tool.pangolinfo.com/>
2. Copy your `pgl_xxxxxxxx` key from the dashboard
3. Top up credits if needed (each Amazon scrape call costs 0.75 credits; `pangolinfo_capabilities` is free)

---

## Manual configuration (per AI client)

Replace `/abs/path/to/pangolinfo-mcp/dist/server.mjs` with your real path, and `pgl_xxxxxxxx` with your key.

### Claude Code (`~/.claude/settings.json`)

```json
{
  "mcpServers": {
    "pangolinfo": {
      "command": "node",
      "args": ["/abs/path/to/pangolinfo-mcp/dist/server.mjs"],
      "env": { "PANGOLINFO_API_KEY": "pgl_xxxxxxxx" }
    }
  }
}
```

> Prefer `claude mcp add --scope user pangolinfo node /abs/path/to/dist/server.mjs` — it writes the same entry without hand-editing JSON.

### Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "pangolinfo": {
      "command": "node",
      "args": ["/abs/path/to/pangolinfo-mcp/dist/server.mjs"],
      "env": { "PANGOLINFO_API_KEY": "pgl_xxxxxxxx" }
    }
  }
}
```

### Cline (VS Code extension)

Open **Cline → MCP Servers → Edit settings JSON**, then add:

```json
{
  "mcpServers": {
    "pangolinfo": {
      "command": "node",
      "args": ["/abs/path/to/pangolinfo-mcp/dist/server.mjs"],
      "env": { "PANGOLINFO_API_KEY": "pgl_xxxxxxxx" }
    }
  }
}
```

The settings file lives at `<vscode-user>/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`.
If you're on the standalone Cline CLI, use `~/.cline/data/settings/cline_mcp_settings.json` instead.

### Windsurf (`~/.codeium/windsurf/mcp_config.json`)

```json
{
  "mcpServers": {
    "pangolinfo": {
      "command": "node",
      "args": ["/abs/path/to/pangolinfo-mcp/dist/server.mjs"],
      "env": { "PANGOLINFO_API_KEY": "pgl_xxxxxxxx" }
    }
  }
}
```

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.pangolinfo]
command = "node"
args = ["/abs/path/to/pangolinfo-mcp/dist/server.mjs"]

[mcp_servers.pangolinfo.env]
PANGOLINFO_API_KEY = "pgl_xxxxxxxx"
```

### Hermes (`~/.hermes/config.yaml`)

```yaml
mcp_servers:
  pangolinfo:
    command: node
    args: ["/abs/path/to/pangolinfo-mcp/dist/server.mjs"]
    env:
      PANGOLINFO_API_KEY: pgl_xxxxxxxx
```

### OpenClaw (`~/.openclaw/openclaw.json`)

```json
{
  "mcpServers": {
    "pangolinfo": {
      "command": "node",
      "args": ["/abs/path/to/pangolinfo-mcp/dist/server.mjs"],
      "env": { "PANGOLINFO_API_KEY": "pgl_xxxxxxxx" }
    }
  }
}
```

---

## Tools (19 — 1 deprecated)

See [`MCP-TOOLS-MAP.md`](./MCP-TOOLS-MAP.md) for the full coordination graph (which tools chain into which).

| # | Tool | Purpose | Cost (credits) |
|---|---|---|---|
| 1 | `search_amazon` | Amazon keyword search → structured product list | 0.75 |
| 2 | `get_amazon_product` | Single-ASIN listing detail (title / bullets / features / aiReviewsSummary) | 0.75 |
| 3 | `get_amazon_reviews` | Batch reviews for an ASIN (VOC mining) | 0.75 |
| 4 | `list_bestsellers` | Amazon Bestsellers by category | 0.75 |
| 5 | `list_new_releases` | Amazon New Releases by category | 0.75 |
| 6 | `list_seller_products` | Catalog of products under one seller | 0.75 |
| 7 | `list_category_products` | All products in a category leaf | 0.75 |
| 8 | `search_categories` | Search Amazon category tree by keyword | 0.75 |
| 9 | `get_category_children` | Drill down one level in the category tree | 0.75 |
| 10 | `filter_categories` | Filter category nodes by criteria | 0.75 |
| 11 | `filter_niches` | Niche discovery (size × competition × growth) | 0.75 |
| 12 | `get_category_paths` | Resolve full ancestor paths for a category node | 0.75 |
| 13 | `search_local_maps` | Google Maps local business search | 0.75 |
| 14 | `wipo_search` | WIPO global design / trademark search (IP clearance) | 2 |
| 15 | `pacer_search` | US patent-litigation (PACER) case + docket timeline search | 12 |
| 16 | `ai_search` | AI Search via Google SERP (AI Overview + organic, with compliance disclaimer) | 2 |
| 17 | `keyword_trends` | Keyword Trends via Google Trends (with compliance disclaimer) | 1.5 |
| 18 | `pangolinfo_capabilities` | Self-introspection — what tools exist, how they chain | **0** (local) |

Default marketplace is **Amazon US** (`marketplaceId=ATVPDKIKX0DER`, `zip=90001`). Override per call via tool arguments.

---

## Auth resolution order

The server resolves the API key with this priority:

1. CLI args: `--api-key=pgl_xxx --api-base=... --scrape-base=...`
2. Env vars: `PANGOLINFO_API_KEY`, `PANGOLINFO_API_BASE`, `PANGOLINFO_SCRAPE_BASE`
3. Config file at `~/.pangolinfo/config.json`:
   ```json
   {
     "api_key": "pgl_xxxxxxxxxxxx",
     "api_base": "https://extapi.pangolinfo.com",
     "scrape_base": "https://scrapeapi.pangolinfo.com"
   }
   ```
4. Missing key → startup failure with an actionable error.

CLI args win over env vars — convenient when you want per-server keys without polluting the global environment.

---

## Internationalization

The server returns Chinese descriptions and error hints by default. Set `PANGOLINFO_LANG=en` to switch to English:

```json
"env": {
  "PANGOLINFO_API_KEY": "pgl_xxxxxxxx",
  "PANGOLINFO_LANG": "en"
}
```

Startup logs are always English (operator-facing); tool descriptions and error `hint` fields follow `PANGOLINFO_LANG`.

---

## Verify your install

After restarting your AI client, ask it:

> List all available `pangolinfo` MCP tools.

You should see 19 tools (one of them, `search_amazon_alexa`, is marked DEPRECATED). Then try:

> Use `pangolinfo_capabilities` with mode "summary".

This is a free local call — if it returns the tool catalog, your install is wired correctly. Next, run something paid like:

> Search Amazon for "wireless mouse" and return the top 5 results.

Expected: ~0.75 credits deducted, ~300 KB of structured product data returned.

---

## Development

```bash
npm install
npm run dev        # tsx src/server.ts — hot-reload
npm run build      # esbuild → dist/server.mjs
npm run typecheck  # tsc --noEmit
npm start          # node dist/server.mjs
```

### Project layout

```
src/
├── server.ts           MCP stdio entry + tool registration
├── auth.ts             API key resolution (CLI > env > config file)
├── client.ts           HTTP client (Authorization, User-Agent)
├── errors.ts           PangolinfoError + status-code mapping
├── config.ts           Default endpoints / constants
├── i18n.ts             zh/en translation lookup
└── tools/
    ├── _types.ts             Tool / ToolContext type definitions
    ├── index.ts              Tool registry (19 tools)
    └── <verb_noun>.ts        One file per tool
```

### Adding a new tool

1. Create `src/tools/<verb_noun>.ts` exporting a `Tool` object — mirror `search_amazon.ts`.
2. Import it in `src/tools/index.ts` and append to the `tools` array.
3. Schema is `zod`; `.describe()` every field — the AI reads those.
4. Never call `fetch` directly — use `ctx.client.post(...)`. Auth is already injected.
5. Throw `PangolinfoError` on failure; the HTTP client already throws this for non-2xx responses.

---

## Security & Data Handling

We take operator and user safety seriously. By design, this MCP server:

- **Brings your own key.** Authentication is via your personal `PANGOLINFO_API_KEY` (issued at <https://tool.pangolinfo.com/>). The key is read locally from your AI client's config or environment — it is never transmitted anywhere except to `https://scrapeapi.pangolinfo.com` (or `https://mcp.pangolinfo.com` for the hosted variant) over TLS 1.2+.
- **No telemetry.** This server does not phone home, does not collect usage analytics, and does not log your prompts. The only outbound traffic is the actual Amazon / Google / WIPO scrape API calls you explicitly invoke through tools.
- **No PII collection.** No user account info, no email, no IP geolocation, and no prompt content is persisted by this server. Tool calls forward only the parameters you (or the AI agent) supplied.
- **Read-only.** Every tool is a strictly read-only data lookup. None of them can write to Amazon, place orders, post reviews, modify listings, or take any side-effecting action on third-party platforms.
- **HTTPS-only transport.** Both the stdio variant (local) and the hosted variant (`https://mcp.pangolinfo.com/mcp`) require HTTPS; HTTP requests are refused.
- **Open source.** The full source is in this repository under MIT license — anyone can audit what the server sends and where.
- **Responsible use.** Pangolinfo APIs aggregate public e-commerce data. You are responsible for using the returned data in compliance with the terms of service of the underlying platforms (Amazon, Google, etc.) and with applicable laws in your jurisdiction.

Report security issues privately to <security@pangolinfo.com> — please do not file public GitHub issues for vulnerabilities.

---

## Support

- **API docs**: <https://docs.pangolinfo.com>
- **Issues**: <https://github.com/pangolinfo/pangolinfo-mcp/issues>
- **Email**: <support@pangolinfo.com>

---

## License

[MIT](./LICENSE) © Pangolinfo
