import { test } from "node:test";
import assert from "node:assert/strict";
import { searchAmazonAlexa } from "../src/tools/search_amazon_alexa.js";

test("Alexa defaults to US and forwards top-level site plus native mode", async () => {
  const calls: any[] = [];
  const ctx = { logger: { info() {} }, client: { post: async (...args: any[]) => { calls.push(args); return {}; } } } as any;
  await searchAmazonAlexa.execute(searchAmazonAlexa.inputSchema.parse({ prompts: ["question"] }), ctx);
  assert.equal(calls[0][0], "/api/v2/scrape");
  assert.equal(calls[0][1].site, "us");
  assert.equal(calls[0][1].scrapeContext.alexaMode, "direct");
  await searchAmazonAlexa.execute(searchAmazonAlexa.inputSchema.parse({ prompts: ["question"], site: "jp", screenshot: true }), ctx);
  assert.equal(calls[1][1].site, "jp");
  assert.equal(calls[1][1].scrapeContext.alexaMode, "playwright");
  assert.throws(() => searchAmazonAlexa.inputSchema.parse({ prompts: ["question"], site: "de" }));
});
