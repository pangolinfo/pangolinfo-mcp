# pangolinfo-mcp

> Pangolinfo MCP server — **17 Amazon e-commerce data tools** for AI assistants via [Model Context Protocol](https://modelcontextprotocol.io).

Plug your favorite AI client (Claude Code, Cursor, Cline, Windsurf, Codex, Hermes, OpenClaw) into Pangolinfo's Amazon scrape APIs and let the AI run keyword research, listing analysis, review mining, niche discovery, category navigation, Google AI Search lookups, Google Trends checks, and WIPO trademark clearance — all from natural-language instructions.

| | |
|---|---|
| **Version** | `0.1.0` |
| **Tools** | 17 (16 backend + 1 self-introspection) |
| **Transport** | stdio (MCP standard) |
| **Runtime** | Node.js 18+ |
| **License** | MIT |
| **Get an API key** | <https://extapi.pangolinfo.com> |

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

### Manual install (developers / advanced users)

Requires Node.js 18+ and git.

```bash
git clone https://github.com/pangolinfo/pangolinfo-mcp.git
cd pangolinfo-mcp
npm install
npm run build       # produces dist/server.js
```

Then wire it into your AI client manually — see the per-client snippets below.

---

## Get an API key

1. Sign up at <https://extapi.pangolinfo.com>
2. Copy your `pgl_xxxxxxxx` key from the dashboard
3. Top up credits if needed (each Amazon scrape call costs 0.75 credits; `pangolinfo_capabilities` is free)

---

## Manual configuration (per AI client)

Replace `/abs/path/to/pangolinfo-mcp/dist/server.js` with your real path, and `pgl_xxxxxxxx` with your key.

### Claude Code (`~/.claude/settings.json`)

```json
{
  "mcpServers": {
    "pangolinfo": {
      "command": "node",
      "args": ["/abs/path/to/pangolinfo-mcp/dist/server.js"],
      "env": { "PANGOLINFO_API_KEY": "pgl_xxxxxxxx" }
    }
  }
}
```

> Prefer `claude mcp add --scope user pangolinfo node /abs/path/to/dist/server.js` — it writes the same entry without hand-editing JSON.

### Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "pangolinfo": {
      "command": "node",
      "args": ["/abs/path/to/pangolinfo-mcp/dist/server.js"],
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
      "args": ["/abs/path/to/pangolinfo-mcp/dist/server.js"],
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
      "args": ["/abs/path/to/pangolinfo-mcp/dist/server.js"],
      "env": { "PANGOLINFO_API_KEY": "pgl_xxxxxxxx" }
    }
  }
}
```

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.pangolinfo]
command = "node"
args = ["/abs/path/to/pangolinfo-mcp/dist/server.js"]

[mcp_servers.pangolinfo.env]
PANGOLINFO_API_KEY = "pgl_xxxxxxxx"
```

### Hermes (`~/.hermes/config.yaml`)

```yaml
mcp_servers:
  pangolinfo:
    command: node
    args: ["/abs/path/to/pangolinfo-mcp/dist/server.js"]
    env:
      PANGOLINFO_API_KEY: pgl_xxxxxxxx
```

### OpenClaw (`~/.openclaw/openclaw.json`)

```json
{
  "mcpServers": {
    "pangolinfo": {
      "command": "node",
      "args": ["/abs/path/to/pangolinfo-mcp/dist/server.js"],
      "env": { "PANGOLINFO_API_KEY": "pgl_xxxxxxxx" }
    }
  }
}
```

---

## Tools (17)

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
| 14 | `wipo_search` | WIPO global trademark search (IP clearance) | 0.75 |
| 15 | `google_ai_search` | Google AI Overview / SGE answer for a query | 0.75 |
| 16 | `google_trends` | Google Trends interest-over-time | 0.75 |
| 17 | `pangolinfo_capabilities` | Self-introspection — what tools exist, how they chain | **0** (local) |

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

You should see 17 tools. Then try:

> Use `pangolinfo_capabilities` with mode "summary".

This is a free local call — if it returns the tool catalog, your install is wired correctly. Next, run something paid like:

> Search Amazon for "wireless mouse" and return the top 5 results.

Expected: ~0.75 credits deducted, ~300 KB of structured product data returned.

---

## Development

```bash
npm install
npm run dev        # tsx src/server.ts — hot-reload
npm run build      # esbuild → dist/server.js
npm run typecheck  # tsc --noEmit
npm start          # node dist/server.js
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
    ├── index.ts              Tool registry (17 tools)
    └── <verb_noun>.ts        One file per tool
```

### Adding a new tool

1. Create `src/tools/<verb_noun>.ts` exporting a `Tool` object — mirror `search_amazon.ts`.
2. Import it in `src/tools/index.ts` and append to the `tools` array.
3. Schema is `zod`; `.describe()` every field — the AI reads those.
4. Never call `fetch` directly — use `ctx.client.post(...)`. Auth is already injected.
5. Throw `PangolinfoError` on failure; the HTTP client already throws this for non-2xx responses.

---

## Support

- **API docs**: <https://docs.pangolinfo.com>
- **Issues**: <https://github.com/pangolinfo/pangolinfo-mcp/issues>
- **Email**: <support@pangolinfo.com>

---

## License

[MIT](./LICENSE) © Pangolinfo
