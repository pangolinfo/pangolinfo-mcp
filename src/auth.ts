/**
 * Pangolinfo MCP - API Key & endpoint loader.
 *
 * Per CONTRACT.md §3 — load order:
 *   1. CLI args:  --api-key=xxx  --api-base=xxx  --scrape-base=xxx
 *   2. Env vars:  PANGOLINFO_API_KEY / PANGOLINFO_API_BASE / PANGOLINFO_SCRAPE_BASE
 *   3. Config file: ~/.pangolinfo/config.json
 *   4. Missing key → startup failure with actionable message
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { CONFIG } from "./config.js";

export interface ResolvedAuth {
  apiKey: string;
  apiBase: string;
  scrapeBase: string;
  source: "cli" | "env" | "config-file" | "mixed";
}

interface CliArgs {
  apiKey?: string;
  apiBase?: string;
  scrapeBase?: string;
}

interface ConfigFile {
  api_key?: string;
  api_base?: string;
  scrape_base?: string;
}

/**
 * Parse `--key=value` style CLI flags from process.argv.
 * Unknown flags are ignored — they are not our concern here.
 */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq < 0) continue;
    const key = raw.slice(2, eq);
    const value = raw.slice(eq + 1);
    if (!value) continue;
    switch (key) {
      case "api-key":
        out.apiKey = value;
        break;
      case "api-base":
        out.apiBase = value;
        break;
      case "scrape-base":
        out.scrapeBase = value;
        break;
    }
  }
  return out;
}

/**
 * Expand `~/...` to the user's home directory.
 * CONFIG.CONFIG_FILE_PATH is stored with `~` for documentation
 * purposes; the actual fs call needs an absolute path.
 */
export function expandHome(path: string): string {
  if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

function readConfigFile(): ConfigFile | null {
  const path = expandHome(CONFIG.CONFIG_FILE_PATH);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as ConfigFile;
  } catch {
    // Corrupt config file is treated as "not present" — we'll fall
    // through to the failure branch with a helpful message.
    return null;
  }
}

/**
 * Resolve auth + endpoints from CLI → env → config file → fail.
 * Throws a plain Error (not PangolinfoError) because this is a
 * startup-time / non-API failure.
 */
export function loadAuth(argv: readonly string[] = process.argv.slice(2)): ResolvedAuth {
  const cli = parseCliArgs(argv);
  const env = {
    apiKey: process.env.PANGOLINFO_API_KEY,
    apiBase: process.env.PANGOLINFO_API_BASE,
    scrapeBase: process.env.PANGOLINFO_SCRAPE_BASE,
  };
  const file = readConfigFile();

  const apiKey = cli.apiKey ?? env.apiKey ?? file?.api_key;
  const apiBase =
    cli.apiBase ?? env.apiBase ?? file?.api_base ?? CONFIG.DEFAULT_API_BASE;
  const scrapeBase =
    cli.scrapeBase ??
    env.scrapeBase ??
    file?.scrape_base ??
    CONFIG.DEFAULT_SCRAPE_BASE;

  if (!apiKey) {
    throw new Error(
      [
        "Pangolinfo MCP 启动失败：未找到 API Key。",
        "请按以下任一方式提供：",
        "  1. 运行 installer（推荐）：会写入 ~/.pangolinfo/config.json",
        "  2. 设置环境变量：PANGOLINFO_API_KEY=pgl_xxxxxxxx",
        "  3. 通过命令行参数：--api-key=pgl_xxxxxxxx（适合 mcp.json 配置）",
      ].join("\n"),
    );
  }

  let source: ResolvedAuth["source"];
  if (cli.apiKey) source = "cli";
  else if (env.apiKey) source = "env";
  else source = "config-file";

  // If endpoints came from a different layer than the key, mark mixed.
  const endpointSources = [
    cli.apiBase || cli.scrapeBase ? "cli" : null,
    env.apiBase || env.scrapeBase ? "env" : null,
    file?.api_base || file?.scrape_base ? "config-file" : null,
  ].filter(Boolean);
  if (endpointSources.length > 0 && !endpointSources.includes(source)) {
    source = "mixed";
  }

  return { apiKey, apiBase, scrapeBase, source };
}
