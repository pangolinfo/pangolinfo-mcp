/**
 * Single source of truth for server version.
 *
 * Keep in sync with package.json `version` at release time.
 * Imported by:
 *   - server.ts (used in SERVER_VERSION + /health response)
 *   - tools/pangolinfo_capabilities.ts (returned in summary mode)
 *
 * Why a TS constant and not `import pkg from "../package.json"`:
 * esbuild's --bundle would happily inline the JSON, but the resolution
 * path differs between `npm run dev` (tsx, runs from src/) and the
 * built bundle (everything inlined into dist/server.mjs). A plain
 * string here is portable across both with zero ceremony.
 */
export const SERVER_VERSION = "0.7.5";
