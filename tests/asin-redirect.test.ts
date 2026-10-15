import assert from "node:assert/strict";
import test from "node:test";
import { PangolinfoClient } from "../src/client.js";
import { PangolinfoError, codeFromBizCode, hintFor } from "../src/errors.js";
import { setLocale } from "../src/i18n.js";

test("HTTP 200 redirect preserves target and charge and cannot be retried", async () => {
  let calls = 0;
  const message = "Redirected to ASIN B0DSHTVHNZ";
  const client = new PangolinfoClient({
    apiKey: "test-only", baseUrl: "https://example.invalid",
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ code: 9206, message, pointCost: 1, data: { json: [] } }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    },
  });
  await assert.rejects(client.post("/api/v1/scrape/follow-seller", {}), (error: unknown) => {
    assert.ok(error instanceof PangolinfoError);
    assert.equal(error.code, "ASIN_REDIRECTED");
    assert.equal(error.retriable, false);
    assert.equal(error.message, message);
    assert.equal((error.details as { pointCost: number }).pointCost, 1);
    return true;
  });
  assert.equal(calls, 1);
});

test("redirect hints explain billing in both languages; failures remain retriable", () => {
  setLocale("zh");
  assert.match(hintFor("ASIN_REDIRECTED"), /计费.*不要自动重试/);
  setLocale("en");
  assert.match(hintFor("ASIN_REDIRECTED"), /billed.*Do not automatically retry/);
  assert.equal(new PangolinfoError(codeFromBizCode(9200), 200, "failed").retriable, true);
});

test("missing marketplace ASIN preserves 9204 message and charge without retry", async () => {
  let calls = 0;
  const message = "ASIN not found on this marketplace: B08HSS37H7";
  const client = new PangolinfoClient({
    apiKey: "test-only", baseUrl: "https://example.invalid",
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ code: 9204, message, pointCost: 1, data: { json: [] } }), { status: 200 });
    },
  });
  await assert.rejects(client.post("/api/v1/scrape/follow-seller", {}), (error: unknown) => {
    assert.ok(error instanceof PangolinfoError);
    assert.equal(error.code, "ASIN_UNAVAILABLE");
    assert.equal(error.message, message);
    assert.equal(error.retriable, false);
    assert.equal((error.details as { pointCost: number }).pointCost, 1);
    return true;
  });
  assert.equal(calls, 1);
  setLocale("en");
  assert.match(hintFor("ASIN_UNAVAILABLE"), /billed.*Do not automatically retry/);
  setLocale("zh");
  assert.match(hintFor("ASIN_UNAVAILABLE"), /计费.*请勿自动重试/);
});
