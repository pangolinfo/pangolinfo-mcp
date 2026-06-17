/**
 * Pangolinfo MCP - shared Tool / ToolContext types.
 *
 * Per CONTRACT.md §2 — every tool exports an object matching this
 * shape. The server iterates the registry in `tools/index.ts` and
 * wires them up to the MCP SDK.
 */

import type { z } from "zod";
import type { PangolinfoClient } from "../client.js";

export interface ToolLogger {
  info(msg: string): void;
  error(msg: string, err?: Error): void;
}

export interface ToolContext {
  client: PangolinfoClient;
  logger: ToolLogger;
  /**
   * Last 8 chars of the caller's API key (e.g. "…a1b2c3d4"), used only to
   * attribute call-log lines to a customer without exposing the full key
   * or decoding the JWT. Undefined in stdio mode (single user) — the log
   * line falls back to "stdio".
   */
  keyTag?: string;
}

export interface Tool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Snake_case verb_noun name, per CONTRACT §1. */
  name: string;
  /** Human-readable description shown to the AI. */
  description: string;
  /** Zod schema used for validation + JSON Schema generation. */
  inputSchema: TSchema;
  /** Executes the tool. Must throw `PangolinfoError` on failures. */
  execute(input: z.infer<TSchema>, ctx: ToolContext): Promise<unknown>;
}
