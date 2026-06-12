/**
 * Pangolinfo MCP - i18n / locale support.
 *
 * Per CONTRACT-i18n.md §1.1 / §2.2 — provides synchronous translation
 * helpers used by every tool file at load time (top-level `t()` calls)
 * and by `errors.ts` `hintFor()` at runtime.
 *
 * Locale is determined ONCE at module load (IIFE below) by checking,
 * in order: `--lang=` CLI flag, `PANGOLINFO_LANG`, `$LANG` / `$LC_ALL`,
 * fallback `"zh"`. This auto-init is what makes the static
 * `import { tools } from "./tools/index.js"` in server.ts safe: by the
 * time any tool file runs its top-level `t()`, the locale is already
 * set. Callers can still `setLocale()` explicitly (used in tests).
 *
 * Startup logs stay English (developer-facing) — see §1.1 of contract.
 */

export type Locale = "zh" | "en";

let currentLocale: Locale = "zh";

/** Override the auto-detected locale. Mainly useful for tests. */
export function setLocale(loc: Locale): void {
  currentLocale = loc;
}

/** Return the currently active locale. */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Look up a bilingual string at call time. Resolved synchronously —
 * tools call this at module top level, so the locale MUST already be
 * determined by then (the IIFE below handles that).
 */
export function t(messages: Record<Locale, string>): string {
  return messages[currentLocale] ?? messages.zh;
}

/**
 * Resolve locale from CLI args + env. Pure function, no side effects.
 * Exported so tests / server.ts can call it explicitly.
 *
 * Precedence: --lang= > PANGOLINFO_LANG > $LANG / $LC_ALL > "zh".
 */
export function detectLocale(argv: readonly string[]): Locale {
  // 1. Explicit CLI flag — highest priority.
  for (const arg of argv) {
    if (arg.startsWith("--lang=")) {
      const v = arg.slice("--lang=".length);
      if (v === "zh" || v === "en") return v;
    }
  }
  // 2. Dedicated env var.
  const env = process.env.PANGOLINFO_LANG;
  if (env === "zh" || env === "en") return env;
  // 3. OS locale — zh* → zh, anything else non-empty → en.
  const lang = process.env.LANG || process.env.LC_ALL || "";
  if (lang.toLowerCase().startsWith("zh")) return "zh";
  if (lang) return "en";
  // 4. No locale signal at all (e.g. clean inspection sandboxes like the
  //    Glama directory, which run the server with no LANG/PANGOLINFO_LANG):
  //    default to en so public catalogs show English. Chinese users keep
  //    zh via $LANG=zh* or explicit PANGOLINFO_LANG=zh. See CONTRACT-i18n.md §0.
  return "en";
}

// ---------------------------------------------------------------------------
// Auto-init — runs once when this module is first imported. Because every
// tool file imports `t` from here, this IIFE always executes before any
// tool's top-level `t({zh,en})` call resolves. That lets server.ts keep
// using static `import { tools } from "./tools/index.js"` without races.
// ---------------------------------------------------------------------------
currentLocale = detectLocale(process.argv.slice(2));
