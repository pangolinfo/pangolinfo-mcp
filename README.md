# Pangolinfo MCP

One MCP service for synchronous Amazon research, ecommerce Product and Reviews, AI search, keyword trends and profit calculations.

- **Version:** 0.11.0
- **Tools:** 22 total, including 21 business tools and free local `pangolinfo_capabilities`.
- **Hosted endpoint:** `https://mcp.pangolinfo.com/mcp` (Streamable HTTP).
- **Authentication:** your Pangolinfo API key; existing endpoint and client configuration remain valid.
- **Scope:** seven ecommerce platforms, existing Amazon/category/niche tools and V1/V2 synchronous APIs. Social media, all V3 APIs and asynchronous jobs/callbacks/polling are excluded.

## Upgrade from 0.10.x

Page bodies are now **fenced**: when a tool returns a whole page — either the non-JSON response path or a `format: "markdown"` call, whose page text arrives inside the usual JSON envelope — the text is prefixed with a security notice and bracketed by `=====UNTRUSTED_<id>_BEGIN/END=====` markers carrying the id of that response, and the body is cut at 60,000 characters with a note saying where it stopped (in the markdown case each string leaf of 1,000+ characters is treated as page text — cut and fenced — while the envelope's metadata is untouched and stays valid JSON). Structured (billed) results are **never** truncated — above ~200,000 characters they are returned in full with a warning telling the model not to re-request.

Structured results are valid JSON in the first MCP content block. Large results include a second text block with the size notice. `collect_ecommerce_data` accepts a maximum explicit `pageSize` of 20 with `includeNative`, and `get_category_paths` accepts up to 100 IDs per call.

## Upgrade from 0.9.x

`collect_social_data`, `search_naver_cafe`, `search_local_maps` and `wipo_search` are no longer registered. Refresh your client's tool cache. The independent VOC Insight MCP is retired; its social/brand/report/persona tools are not migrated here. REST services and stored data are unchanged.

`calculate_amazon_profit` is new. `collect_ecommerce_data` exposes seven platforms with `product-detail` and `reviews`. Use Product for combined details and aggregate ratings; Shopify and the legacy `product-summary` operation are outside this MCP catalog.

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

1. Sign up at <https://tool.pangolinfo.com/#/en/system/loading?sourceTag=github_amz>
2. Copy your `pgl_xxxxxxxx` key from the dashboard
3. Top up credits if needed (charges depend on the data tool and format; `pangolinfo_capabilities` is free)

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

## Hosted (remote HTTP) — no local install

Don't want to install anything? Point your AI client at the hosted endpoint
instead of a local `server.mjs`. This is the **streamable HTTP** transport
(MCP spec), multi-tenant — you bring your own key on every request.

| | |
|---|---|
| **Endpoint** | `https://mcp.pangolinfo.com/mcp` |
| **Transport** | Streamable HTTP (POST + SSE) |
| **Auth** | Your `pgl_xxxxxxxx` key, via Bearer header **or** URL query |

### Passing your API key — two ways

**1. `Authorization` header (recommended)**

```
Authorization: Bearer pgl_xxxxxxxx
```

This is the preferred method: the key stays out of URLs, logs, and browser
history. The `Bearer` scheme is matched **case-insensitively** (`bearer`,
`BEARER`, `Bearer` all work) and extra whitespace is tolerated.

**2. `?api_key=` URL query (fallback)**

```
https://mcp.pangolinfo.com/mcp?api_key=pgl_xxxxxxxx
```

Easiest for clients that only let you paste a URL. If your key contains
URL-special characters, **URL-encode it**. The header (method 1) takes
precedence if both are supplied.

### Client config example (Claude Code / Cursor — `"url"`-style remote MCP)

```json
{
  "mcpServers": {
    "pangolinfo": {
      "url": "https://mcp.pangolinfo.com/mcp",
      "headers": { "Authorization": "Bearer pgl_xxxxxxxx" }
    }
  }
}
```

> If your client can't set headers, fall back to the URL form:
> `"url": "https://mcp.pangolinfo.com/mcp?api_key=pgl_xxxxxxxx"`.

### Notes for custom / raw HTTP integrations

If you're calling the endpoint directly (not through a standard MCP client):

- **POST** your JSON-RPC body to `/mcp`.
- The MCP streamable transport normally requires the request to advertise
  **both** `application/json` and `text/event-stream` in its `Accept` header.
  This server **backfills** the missing media type for you, so a plain
  `Accept: application/json`, `Accept: */*`, or even a missing `Accept`
  header all work — you don't need to hand-craft it.
- A `401` means the key was not found in **either** the header **or** the
  query string — check that your client actually sent it (some libraries
  drop the `Authorization` header on cross-origin redirects).

---

## Tools (21 total)

| Tool | Capability | Points |
| --- | --- | --- |
| `pangolinfo_capabilities` | Current catalog and workflows; no backend call | Free |
| `search_amazon` | Amazon keyword search. Optional `platform` selects `pc` (default) or `mobile` (Amazon US, fixed ZIP 10041). Also available in `scrape_url` with `parserName=amzKeyword`. | JSON 1/page; rawHtml/markdown 0.75/page |
| `get_amazon_product` | Amazon product details | JSON 1/page; rawHtml/markdown 0.75/page |
| `get_amazon_videos` | Amazon main-media popup, Premium A+ and Product Videos | 1 point per successful snapshot |
| `get_amazon_delivery_time` | Product details plus delivery estimates | 2 |
| `get_amazon_reviews` | Amazon buyer reviews | 5/page |
| `list_bestsellers` | Best sellers | JSON 1/page; rawHtml/markdown 0.75/page |
| `list_new_releases` | New releases | JSON 1/page; rawHtml/markdown 0.75/page |
| `list_seller_products` | Seller listings | JSON 1/page; rawHtml/markdown 0.75/page |
| `list_category_products` | Category listings | JSON 1/page; rawHtml/markdown 0.75/page |
| `search_categories` | Category keyword search | 2/call |
| `get_category_children` | Category children | 2/call |
| `filter_categories` | Category analytics | 5/call |
| `filter_niches` | Niche analytics | 10/call |
| `get_category_paths` | Category breadcrumb paths | 2/call |
| `ai_search` | AI Overview / AI Mode | 2 |
| `keyword_trends` | Keyword trends | 1.5 |
| `scrape_url` | Generic Amazon pages; includes competing offers | Format/parser-specific; offers 1 |
| `search_amazon_alexa` | Alexa Agent answers | 6/answered turn |
| `get_amazon_alexa_questions` | Alexa Listing questions and answers | 0/5 discovery + 20/answered region, max 45 |
| `collect_ecommerce_data` | Seven-platform Product and Reviews | 0.8/product or unique review |
| `calculate_amazon_profit` | US/JP FBA and merchant-fulfilled fees, profit and margin | 5 |

Billing follows the corresponding REST API rules. Preserve `pointCost` when returned; an absent field does not mean zero cost. Revenue Calculator does not return `pointCost` and costs a fixed 5 points per successful call. Unavailable-ASIN and redirect outcomes have their own billing rules.

### Profit example

```json
{"asin":"B07FZ8S74R","country":"US"}
```

`country` accepts US/JP, case-insensitively. Optional prices, shipping, package dimensions/weight and `programs` follow the [Revenue Calculator API](https://docs.pangolinfo.com/en-api-reference/revenueCalculatorApi/revenueCalculatorAPI). Returns `code`, `message` and `data` containing `summary`, `product` and `raw`; there is no `pointCost` field. Product-not-found code `8000` is unbilled and maps to `PRODUCT_NOT_FOUND`, `retriable=no`; check ASIN and marketplace before changing the request.

Profit calculation has a 180-second local wait budget; allow at least 210 seconds in your MCP client. This budget is not a bound on backend retries and cannot override a gateway timeout. A timeout, connection failure or HTTP 5xx maps to `OUTCOME_UNKNOWN`, `retriable=no`: completion and billing are unknown. Check call/credit records before deciding to submit again. A confirmed business failure keeps its normal classification. Before release, verify both the client-to-MCP and MCP-to-REST gateway limits; increasing this local budget alone cannot guarantee delivery or backend cancellation.

### Ecommerce example

```json
{"platform":"walmart","operation":"product-detail","country":"US","productId":"103158059"}
```

Product combines details and aggregate ratings; Reviews returns buyer reviews. See [ecommerce parameters](docs/review-collection.md) and the [MCP tool reference](https://docs.pangolinfo.com/en-help-center/mcp/tools).

For competing offers, call `scrape_url` with `parserName=amzFollowSeller` and either an ASIN in `content` or an Amazon product URL. Each returned item includes `soldBy`, `hasSoldByLink` (linked seller name vs. plain text), and optional `isFeatured` for the featured offer.

Review code `9206` confirms an ASIN redirect (for example `B0GGC6B8ZD` → `B000XH82O6`). MCP reports `ASIN_REDIRECTED`, `retriable=no`, preserving the destination message and `pointCost`. The original review request is billed normally. Empty review pages may trigger an additional product-page verification, which adds latency but has no separate charge. Do not automatically retry or fetch the destination ASIN.

Follow Seller code `9206` means a confirmed product redirect and is billed as a normal request (usually 1 credit; see `pointCost`). `message` contains the destination, for example `Redirected to ASIN B0DSHTVHNZ`. `data.json` retains the empty result for the original request; the destination product is not queried automatically. Do not automatically retry the original ASIN. Query the destination separately only after confirming it; that request is billed separately. Fetch failures, mismatched delivery destinations, and unconfirmed redirects remain `9200` without a charge. MCP reports `[ASIN_REDIRECTED]` with `retriable=no` and preserves the backend message and `pointCost` in error details.

When the product-detail check explicitly confirms that the requested ASIN is missing on the current marketplace, Follow Seller returns `9204` with `message: ASIN not found on this marketplace: B08HSS37H7` (the requested ASIN). This is billed normally, usually 1 credit; see `pointCost`. Do not automatically retry the same marketplace and ASIN; check the marketplace and identifier first. The ASIN may still exist on another marketplace. An empty or 404 offers page alone, network failures, challenges, or inconclusive evidence do not establish that the ASIN is missing; unconfirmed results remain `9200` without a charge. MCP reports `[ASIN_UNAVAILABLE]` with `retriable=no` and preserves the message and credit cost.

`search_amazon_alexa` returns a `status` on every turn: `answered`, `refused` (Amazon declined the question; `content` and `products` are empty and `refusal_message` holds Amazon's wording, e.g. `その質問にはお答えできません。`) or `failed`. Only answered turns are billed (6 credits each). When Amazon declines every turn the call fails with `ALEXA_REFUSED` (code `9207`, not billed, `retriable=no`); the same prompt will be declined again, so rephrase it rather than retrying.

US `search_amazon_alexa` queries optionally accept `asin` or a product `url`; both must identify the same product when supplied together. The response includes `asin` and `context_source: "product_page"` only after the real Amazon PDP request context is verified. The product panel is used without requiring inline preset-question buttons. `get_amazon_alexa_questions` falls back to initial side-panel suggestions when both inline regions are empty; these appear in `regions.panel` with `source: "panel"`. With `region: "all"`, panel answers count as one answer region (25 credits including discovery); no available suggestions costs zero.

For product subtitles/highlights, read `get_amazon_product` JSON at `data.json[0].data.results[0].itemHighlights`. The parser normalizes the dedicated subtitle, the main-title suffix, or an already parsed `Item Highlight(s)` attribute into this string; it is empty when unavailable. Markdown conversion is not required.

> **Plus a free local call:** `pangolinfo_capabilities` returns the full tool catalog, canonical workflows, and usage tips with no backend round-trip (**0** credits). It is a self-introspection helper, one of the 22 registered tools, alongside 21 business tools.

Default marketplace is **Amazon US** (`marketplaceId=ATVPDKIKX0DER`, `zip=90001`). Override per call via tool arguments.

### ⏱️ Slow tools & your client's tool-call timeout

Two tools legitimately run long because they wait on live AI generation:

| Tool | Typical latency | Worst case |
|---|---|---|
| `search_amazon_alexa` (Rufus) | **60–90s** per prompt | >200s for multiple prompts |
| `ai_search` | ~30s | ~60s |

Most MCP clients enforce a **per-tool-call timeout — often 60 seconds of silence** — and abort the call if nothing comes back in time. When that happens the client reports a transport-level timeout/disconnect, and the agent mistakes it for **"the tool is unavailable/broken."** This is the usual reason `search_amazon_alexa` gets flagged as unavailable — it reliably crosses the silent 60s line.

Two things keep this from happening:

1. **The server emits progress heartbeats.** While a tool runs, the server sends a `notifications/progress` every 15s **if your client included a `progressToken` in the call**. Spec-compliant clients reset their idle timeout on each heartbeat, so the whole 60–90s render stays under the wire. Most modern MCP clients send a `progressToken` automatically — no action needed.

2. **Raise the client timeout for clients that don't honor progress.** If your client has no `progressToken` support or a hard cap, bump its MCP tool-call timeout to **≥120s** before using `search_amazon_alexa`. Where to set it depends on the client (examples):
   - **Claude Code / config-based clients:** raise the MCP request/tool timeout in the client config.
   - **Custom SDK clients:** pass a larger `timeout` (and, ideally, a `progressToken`) in the `callTool` request options.

Also prefer **exactly one prompt per `search_amazon_alexa` call** — multiple prompts stack latency linearly and make the timeout far more likely.

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

Tool descriptions and error hints are available in **English** and **Chinese**. The
language is resolved in this order: `--lang=zh|en` → `PANGOLINFO_LANG=zh|en` → OS locale
(`$LANG` starting with `zh*` → Chinese, otherwise English) → English when there is no
locale signal at all. So a Chinese-locale machine gets Chinese automatically; everyone
else gets English. Force a language explicitly:

```json
"env": {
  "PANGOLINFO_API_KEY": "pgl_xxxxxxxx",
  "PANGOLINFO_LANG": "zh"
}
```

Startup logs are always English (operator-facing); tool descriptions and error `hint` fields follow the resolved locale.

---

## Verify your install

After restarting your AI client, ask it:

> List all available `pangolinfo` MCP tools.

You should see 22 tools (21 business tools plus free introspection). Then try:

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
    ├── index.ts              Tool registry (22 total, including capabilities)
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

- **Brings your own key.** Authentication is via your personal `PANGOLINFO_API_KEY` (issued at <https://tool.pangolinfo.com/#/en/system/loading?sourceTag=github_amz>). The key is read locally from your AI client's config or environment — it is never transmitted anywhere except to `https://scrapeapi.pangolinfo.com` (or `https://mcp.pangolinfo.com` for the hosted variant) over TLS 1.2+.
- **No telemetry.** This server does not phone home, does not collect usage analytics, and does not log your prompts. The only outbound traffic is the Amazon / ecommerce / search data API calls you explicitly invoke through tools.
- **No PII collection.** No user account info, no email, no IP geolocation, and no prompt content is persisted by this server. Tool calls forward only the parameters you (or the AI agent) supplied.
- **Read-only.** Every tool is a strictly read-only data lookup. None of them can write to Amazon, place orders, post reviews, modify listings, or take any side-effecting action on third-party platforms.
- **Scraped text is fenced, not trusted.** Anything a third party wrote — a page body, a gateway error page — is wrapped in a `SECURITY NOTICE` plus `=====UNTRUSTED_<id>_BEGIN/END=====` markers carrying a random per-response id, so the model can tell our instructions from a page's text. Marker-like strings inside the payload are defanged, and any forged closing marker can never match the response's own id.
- **Oversized results never silently lose data.** Page bodies are cut at 60,000 characters and the cut is annotated. Billed results (reviews, product lists) are returned in full at any size — they are charged per record and not stored server-side, so dropping them would destroy paid data.
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


For synchronous product details (`POST /api/v1/scrape`, `parserName=amzProductDetail`), an explicit confirmation that the ASIN is missing on the requested marketplace returns `9204` with the message `ASIN not found on this marketplace: B08HSS37H7` (the requested ASIN). Normal format-specific pricing applies; see `pointCost` (usually 1 credit for JSON). Do not automatically retry the same marketplace and ASIN; check the marketplace and identifier. The ASIN may exist on another marketplace. Network failures or no content remain `9200` without a charge. This describes the synchronous product-detail endpoint. `get_amazon_product` and `scrape_url` surface this as `[ASIN_UNAVAILABLE]`, `retriable=no`.
