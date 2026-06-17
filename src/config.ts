/**
 * Pangolinfo MCP - shared configuration constants.
 *
 * Per CONTRACT.md §7 — these strings are defined ONCE here. Do not
 * hardcode them anywhere else in the codebase.
 */

export const CONFIG = {
  DEFAULT_API_BASE: "https://extapi.pangolinfo.com",
  DEFAULT_SCRAPE_BASE: "https://scrapeapi.pangolinfo.com",
  CONFIG_FILE_PATH: "~/.pangolinfo/config.json",
  USER_AGENT: "pangolinfo-mcp/1.0",
  /**
   * Customer-facing site where users log in to obtain / top up their API
   * Key. Surfaced in AUTH / QUOTA error hints so the AI can direct the
   * user to a concrete next step. Defined once here per CONTRACT §7.
   */
  WEBSITE_URL: "https://www.pangolinfo.com",
} as const;
