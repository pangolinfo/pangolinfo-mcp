import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PangolinfoClient } from "../src/client.js";
import { calculateAmazonProfit } from "../src/tools/calculate_amazon_profit.js";
import { collectEcommerceData } from "../src/tools/collect_ecommerce_data.js";
import { tools } from "../src/tools/index.js";
import { pangolinfoCapabilities } from "../src/tools/pangolinfo_capabilities.js";
import { PangolinfoError, codeFromBizCode, hintFor } from "../src/errors.js";
import { setLocale } from "../src/i18n.js";

const logger = { info() {}, error() {} };

test("profit calculation preserves the REST envelope without inventing pointCost", async () => {
  const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  // RevenueCalculatorController wraps only data in ApiResponse.success;
  // SubmitResponse in the public OpenAPI has code/message/data, no pointCost.
  const response = JSON.parse(readFileSync(new URL("./fixtures/revenue-calculator-success.json", import.meta.url), "utf8"));
  const client = new PangolinfoClient({ apiKey: "offline-test-key", baseUrl: "https://offline.invalid", fetchImpl: async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init!.body as string), headers: init!.headers as Record<string, string> });
    return new Response(JSON.stringify(response), { status: 200 });
  } });
  const input = calculateAmazonProfit.inputSchema.parse({ asin: "b07fz8s74r", country: "jp", fbaPrice: 1500, mfnPrice: 1600,
    mfnShippingPrice: 0, packageLength: 12, packageWidth: 10, packageHeight: 5, dimensionUnit: "centimeters",
    packageWeight: 0.5, weightUnit: "kilograms", programs: ["FBA", "MFN"] });
  const actual = await calculateAmazonProfit.execute(input, { client, logger });
  assert.deepEqual(actual, response);
  assert.equal(Object.hasOwn(actual as object, "pointCost"), false);
  assert.equal(calls[0].url, "https://offline.invalid/api/v1/revenue-calculator");
  assert.deepEqual(calls[0].body, { ...input, asin: "B07FZ8S74R", country: "JP" });
  assert.equal(calls[0].headers.Authorization, "Bearer offline-test-key");
  assert.equal(calls[0].headers["X-Pangolinfo-Client-Source"], "mcp");
  assert.equal(calls[0].headers["X-Timeout-Ms"], undefined, "local wait budget must not claim a backend deadline");
  assert.deepEqual(calculateAmazonProfit.inputSchema.parse({ asin: "B07FZ8S74R", country: "US" }), { asin: "B07FZ8S74R", country: "US" });
});

test("profit product-not-found is terminal, unbilled and keeps backend evidence", async () => {
  let calls = 0;
  const client = new PangolinfoClient({ apiKey: "offline-test-key", baseUrl: "https://offline.invalid", fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify({ code: 8000, message: "ASIN not found: B07FZ8S74R" }), { status: 200 });
  } });
  await assert.rejects(calculateAmazonProfit.execute(calculateAmazonProfit.inputSchema.parse({ asin: "B07FZ8S74R", country: "US" }), { client, logger }), (error: unknown) => {
    assert.ok(error instanceof PangolinfoError);
    assert.equal(error.code, "PRODUCT_NOT_FOUND");
    assert.equal(error.retriable, false);
    assert.equal((error.details as any).bizCode, 8000);
    assert.equal(error.message, "ASIN not found: B07FZ8S74R");
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(codeFromBizCode(8000), "PRODUCT_NOT_FOUND");
  for (const locale of ["zh", "en"] as const) {
    setLocale(locale);
    assert.match(hintFor("PRODUCT_NOT_FOUND"), locale === "zh" ? /未计费.*不要自动重试/ : /not billed.*Do not automatically retry/);
  }
});

test("profit survives the old 45s floor and treats its 180s timeout as unknown, not retryable", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let delay = 120_000;
  let signal: AbortSignal | undefined;
  let calls = 0;
  const client = new PangolinfoClient({ apiKey: "offline-test-key", baseUrl: "https://offline.invalid", fetchImpl: async (_url, init) => {
    signal = init!.signal as AbortSignal;
    calls++;
    return new Promise<Response>((resolve, reject) => {
      signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      setTimeout(() => resolve(new Response(JSON.stringify({ code: 0, message: "ok", data: {} }))), delay);
    });
  } });
  const input = calculateAmazonProfit.inputSchema.parse({ asin: "B07FZ8S74R", country: "US" });
  const success = calculateAmazonProfit.execute(input, { client, logger });
  t.mock.timers.tick(119_999);
  assert.equal(signal!.aborted, false);
  t.mock.timers.tick(1);
  assert.deepEqual(await success, { code: 0, message: "ok", data: {} });
  delay = 240_000;
  const timedOut = assert.rejects(calculateAmazonProfit.execute(input, { client, logger }), (error: unknown) => {
    assert.ok(error instanceof PangolinfoError);
    assert.equal(error.code, "OUTCOME_UNKNOWN");
    assert.equal(error.retriable, false);
    assert.equal((error.details as any).upstream.deadlineMs, 180_000);
    return true;
  });
  t.mock.timers.tick(179_999);
  assert.equal(signal!.aborted, false);
  t.mock.timers.tick(1);
  await timedOut;
  assert.equal(calls, 2, "one request per explicit call, no automatic retries");
  for (const locale of ["zh", "en"] as const) {
    setLocale(locale);
    assert.match(hintFor("OUTCOME_UNKNOWN"), locale === "zh" ? /扣费.*请勿自动重试/ : /billing.*Do not automatically retry/);
  }
});

test("profit gateway failures are uncertain while explicit business failures retain their classification", async () => {
  const input = calculateAmazonProfit.inputSchema.parse({ asin: "B07FZ8S74R", country: "US" });
  for (const status of [502, 504, 520, 525]) {
    const client = new PangolinfoClient({ apiKey: "offline-test-key", baseUrl: "https://offline.invalid", fetchImpl: async () => new Response("gateway error", { status }) });
    await assert.rejects(calculateAmazonProfit.execute(input, { client, logger }), (error: unknown) => {
      assert.ok(error instanceof PangolinfoError);
      assert.equal(error.code, "OUTCOME_UNKNOWN");
      assert.equal(error.httpStatus, status);
      assert.equal(error.retriable, false);
      return true;
    });
  }
  const client = new PangolinfoClient({ apiKey: "offline-test-key", baseUrl: "https://offline.invalid", fetchImpl: async () => new Response(JSON.stringify({ code: 4030, message: "Amazon rate limited" }), { status: 200 }) });
  await assert.rejects(calculateAmazonProfit.execute(input, { client, logger }), (error: unknown) => {
    assert.ok(error instanceof PangolinfoError);
    assert.equal(error.code, "RATE_LIMIT");
    assert.equal(error.retriable, true);
    return true;
  });
});

test("profit and ecommerce schemas reject unavailable routes and asynchronous inputs", () => {
  for (const patch of [{ country: "DE" }, { asin: "invalid" }, { fbaPrice: -1 }, { packageWeight: 0 },
    { programs: ["OTHER"] }, { callbackUrl: "https://offline.invalid/callback" }, { userId: "another-user" }]) {
    assert.equal(calculateAmazonProfit.inputSchema.safeParse({ asin: "B07FZ8S74R", country: "US", ...patch }).success, false);
  }
  for (const patch of [{ platform: "shopify" }, { operation: "product-summary" }, { callbackUrl: "https://offline.invalid/callback" }]) {
    assert.equal(collectEcommerceData.inputSchema.safeParse({ platform: "walmart", operation: "reviews", country: "US", productId: "123", ...patch }).success, false);
  }
});

test("ecommerce defaults fixed countries and rejects unsupported cross-platform parameters", async () => {
  const calls: { path: string; body: any }[] = [];
  const ctx: any = { logger, client: { async post(path: string, body: any) { calls.push({ path, body }); return { code: 0 }; } } };
  for (const [platform, country] of [["naver", "KR"], ["samsclub", "US"], ["target", "US"], ["tiktok", "US"]]) {
    const input = collectEcommerceData.inputSchema.parse({ platform, productId: "123" });
    await collectEcommerceData.execute(input, ctx);
    assert.deepEqual(calls.at(-1), { path: `/api/v1/ecommerce/${platform}/reviews`, body: { productId: "123", country } });
    assert.equal(collectEcommerceData.inputSchema.safeParse({ platform, productId: "123", country: "DE" }).success, false);
  }
  for (const platform of ["walmart", "costco", "bestbuy"])
    assert.equal(collectEcommerceData.inputSchema.safeParse({ platform, productId: "123" }).success, false);
  for (const patch of [{ merchantId: "x" }, { storeSlug: "x" }, { originProductId: "x" }, { operation: "product-detail", page: 1 }])
    assert.equal(collectEcommerceData.inputSchema.safeParse({ platform: "target", productId: "123", ...patch }).success, false);
});

test("discovery matches the registered synchronous catalog and all workflow tools exist", async () => {
  const capabilities: any = await pangolinfoCapabilities.execute({ detail: "full" }, {} as any);
  const names = tools.map(tool => tool.name);
  assert.equal(names.length, 21);
  assert.equal(new Set(names).size, names.length);
  assert.equal(capabilities.wireTotalCount, names.length);
  assert.equal(capabilities.businessToolCount, names.length - 1);
  assert.deepEqual(capabilities.liveTools.map((tool: any) => tool.name).sort(), names.filter(name => name !== "pangolinfo_capabilities").sort());
  assert.deepEqual(capabilities.fullDescriptions.map((tool: any) => tool.name).sort(), [...names].sort());
  for (const workflow of capabilities.workflows) for (const step of workflow.steps) assert.ok(names.includes(step.split(/[ (]/)[0]), step);
  for (const excluded of ["collect_social_data", "search_naver_cafe", "search_local_maps", "wipo_search", "pacer_search", "get_extraction_result"]) {
    assert.equal(names.includes(excluded), false);
    assert.equal(JSON.stringify(capabilities).includes(excluded), false);
  }
});

test("built stdio tools/list and capabilities agree in both languages without backend requests", async () => {
  for (const locale of ["zh", "en"]) {
    const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/server.mjs"],
      env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
        PANGOLINFO_API_KEY: "offline-test-key", PANGOLINFO_LANG: locale, PANGOLINFO_TRANSPORT: "stdio" }, stderr: "pipe" });
    const client = new Client({ name: "offline-consolidation-check", version: "1.0.0" });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      assert.equal(listed.tools.length, 21);
      const catalog = JSON.stringify(listed);
      assert.doesNotMatch(catalog, /collect_social_data|search_naver_cafe|search_local_maps|wipo_search|callbackUrl|\/api\/v3\//);
      const profit = listed.tools.find(tool => tool.name === "calculate_amazon_profit")!;
      assert.deepEqual(profit.inputSchema.required, ["asin", "country"]);
      const result: any = await client.callTool({ name: "pangolinfo_capabilities", arguments: { detail: "full" } });
      assert.equal(result.isError, undefined);
      const summary = JSON.parse(result.content[0].text);
      assert.equal(summary.wireTotalCount, listed.tools.length);
      assert.equal(summary.locale, locale);
      const removed: any = await client.callTool({ name: "wipo_search", arguments: {} });
      assert.equal(removed.isError, true);
    } finally { await client.close(); }
  }
});
