import { test } from "node:test";
import assert from "node:assert/strict";

import { MAX_PAGE_CHARS, WARN_OVER_CHARS, finalizeResult } from "../src/funnel.js";
import { setLocale } from "../src/i18n.js";

test("short page text is fenced but not cut", () => {
  setLocale("en");
  const page = "x".repeat(1_000);
  const result = finalizeResult(page);
  assert.equal(result.truncated, undefined);
  assert.equal(result.oversized, undefined);
  assert.match(result.text, /=====UNTRUSTED_[0-9a-f]{32}_BEGIN=====/);
  assert.ok(result.text.includes(page));
});

test("long page text is cut to the cap and says where it stopped", () => {
  setLocale("en");
  const page = "§".repeat(MAX_PAGE_CHARS + 1);
  const result = finalizeResult(page);
  assert.deepEqual(result.truncated, { kept: MAX_PAGE_CHARS, total: MAX_PAGE_CHARS + 1 });
  assert.ok(result.text.includes(`kept the first ${MAX_PAGE_CHARS} of ${MAX_PAGE_CHARS + 1} characters`));
  assert.equal((result.text.match(/§/g) ?? []).length, MAX_PAGE_CHARS);
  // The note is ours, so it sits outside the untrusted fence.
  assert.ok(result.text.indexOf("_END=====") < result.text.indexOf("kept the first"));
});

test("structured data is never truncated, even well past the warning line", () => {
  setLocale("en");
  const payload = { code: 0, pointCost: 100, data: { reviews: "z".repeat(WARN_OVER_CHARS) } };
  const result = finalizeResult(payload);
  assert.equal(result.truncated, undefined, "billed data must never be cut");
  assert.equal(result.oversized, true);
  assert.deepEqual(JSON.parse(result.text), payload);
  assert.match(result.warning ?? "", /avoid repeat charges/);
});

test("ordinary structured data is returned verbatim with no fence or warning", () => {
  setLocale("en");
  const payload = { code: 0, message: "ok", data: { asin: "B0B4NLGCH5" } };
  const result = finalizeResult(payload);
  assert.equal(result.text, JSON.stringify(payload, null, 2));
  assert.equal(result.truncated, undefined);
  assert.equal(result.oversized, undefined);
  assert.doesNotMatch(result.text, /UNTRUSTED/);
});

test("markdown envelopes have their page leaf capped, envelope left parseable", () => {
  setLocale("en");
  const page = "§".repeat(MAX_PAGE_CHARS + 2_500);
  const payload = {
    code: 0,
    message: "ok",
    pointCost: 1,
    data: { json: [{ data: page, status_code: 200, url: "https://www.amazon.com/s?k=earbuds" }] },
  };
  const result = finalizeResult(payload, { pageText: true });
  assert.deepEqual(result.truncated, { kept: MAX_PAGE_CHARS, total: page.length });

  const parsed = JSON.parse(result.text);
  assert.equal(parsed.code, 0);
  assert.equal(parsed.message, "ok", "envelope metadata must not be fenced");
  assert.equal(parsed.data.json[0].status_code, 200);
  assert.equal(parsed.data.json[0].url, "https://www.amazon.com/s?k=earbuds");
  const body: string = parsed.data.json[0].data;
  assert.match(body, /=====UNTRUSTED_[0-9a-f]{32}_BEGIN=====/);
  assert.equal((body.match(/§/g) ?? []).length, MAX_PAGE_CHARS);
  assert.match(body, /kept the first 60000 of 62500 characters/);
});

test("a short markdown leaf is fenced whole without a truncation note", () => {
  setLocale("en");
  const page = "# Results\n" + "row\n".repeat(500);
  const result = finalizeResult({ code: 0, data: { json: [{ data: page }] } }, { pageText: true });
  assert.equal(result.truncated, undefined);
  const body: string = JSON.parse(result.text).data.json[0].data;
  assert.ok(body.includes(page));
  assert.doesNotMatch(body, /kept the first/);
});

test("structured truncation warning is localised", () => {
  setLocale("zh");
  const result = finalizeResult({ data: "q".repeat(WARN_OVER_CHARS) });
  assert.match(result.warning ?? "", /已完整返回/);
  setLocale("en");
});
