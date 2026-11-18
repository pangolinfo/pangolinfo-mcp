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

test("Alexa refusal (9207) is terminal, unbilled and keeps Amazon's wording", async () => {
  let calls = 0;
  const message = "Amazon declined to answer: その質問にはお答えできません。";
  const client = new PangolinfoClient({
    apiKey: "test-only", baseUrl: "https://example.invalid",
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ code: 9207, message }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    },
  });
  await assert.rejects(client.post("/api/v2/scrape", {}), (error: unknown) => {
    assert.ok(error instanceof PangolinfoError);
    assert.equal(error.code, "ALEXA_REFUSED");
    assert.equal(error.retriable, false);
    assert.equal(error.message, message);
    return true;
  });
  assert.equal(calls, 1);
  setLocale("en");
  assert.match(hintFor("ALEXA_REFUSED"), /not billed.*do not retry automatically/);
  setLocale("zh");
  assert.match(hintFor("ALEXA_REFUSED"), /未计费.*不要自动重试/);
});


test("review redirect preserves destination and billed credits without retry", async () => {
  let calls = 0;
  const message = "Redirected to ASIN B000XH82O6";
  const client = new PangolinfoClient({
    apiKey: "test-only", baseUrl: "https://example.invalid",
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({code: 9206, message, pointCost: 5, data: {json: [], taskId: "review-task"}}), {status: 200});
    },
  });
  await assert.rejects(client.post("/api/v1/scrape", {parserName: "amzReviewV2", content: "B0GGC6B8ZD"}), (error: unknown) => {
    assert.ok(error instanceof PangolinfoError);
    assert.equal(error.code, "ASIN_REDIRECTED");
    assert.equal(error.retriable, false);
    assert.equal(error.message, message);
    assert.equal((error.details as {pointCost: number}).pointCost, 5);
    return true;
  });
  assert.equal(calls, 1);
});
