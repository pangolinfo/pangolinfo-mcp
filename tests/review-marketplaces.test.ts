import { test } from "node:test";
import assert from "node:assert/strict";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getAmazonReviews } from "../src/tools/get_amazon_reviews.js";

test("review schema exposes France and preserves the existing ten sites", () => {
  const sites = ["amz_us", "amz_de", "amz_uk", "amz_jp", "amz_fr", "amz_au", "amz_mx", "amz_in", "amz_eg", "amz_ae", "amz_ca"];
  const schema = zodToJsonSchema(getAmazonReviews.inputSchema) as any;
  assert.deepEqual(schema.properties.site.enum, sites);
  for (const site of sites) {
    assert.equal(getAmazonReviews.inputSchema.parse({ asin: "B012345678", site }).site, site);
  }
  assert.equal(getAmazonReviews.inputSchema.parse({ asin: "B012345678" }).site, "amz_us");
  assert.throws(() => getAmazonReviews.inputSchema.parse({ asin: "B012345678", site: "amz_it" }));
});

test("France review request maps to amazon.fr with the supplied two-page example", async () => {
  const calls: any[] = [];
  const result = { data: { json: [{ data: { results: [{ asin: "B0FDB3Y1YT", country: "France" }] } }] } };
  const ctx = { logger: { info() {} }, client: { post: async (...args: any[]) => { calls.push(args); return result; } } } as any;
  const input = getAmazonReviews.inputSchema.parse({ asin: "b0fdb3y1yt", site: "amz_fr", pageCount: 2 });
  assert.equal(await getAmazonReviews.execute(input, ctx), result);
  assert.deepEqual(calls, [["/api/v1/scrape", {
    url: "https://www.amazon.fr", site: "",
    bizContext: { bizKey: "review", pageCount: 2, asin: "B0FDB3Y1YT", filterByStar: "all_stars", sortBy: "recent" },
    format: "json", formatType: "all_formats", mediaType: "all_contents", parserName: "amzReviewV2",
  }]]);
});

test("Japan review request maps to co.jp and retains V1 parser and filters", async () => {
  const calls: any[] = [];
  const result = { data: { json: [] } };
  const ctx = { logger: { info() {} }, client: { post: async (...args: any[]) => { calls.push(args); return result; } } } as any;
  const input = getAmazonReviews.inputSchema.parse({
    asin: "b012345678", site: "amz_jp", pageCount: 2,
    filterByStar: "critical", sortBy: "helpful", mediaType: "media_reviews_only",
  });
  assert.equal(await getAmazonReviews.execute(input, ctx), result);
  assert.deepEqual(calls, [["/api/v1/scrape", {
    url: "https://www.amazon.co.jp", site: "",
    bizContext: { bizKey: "review", pageCount: 2, asin: "B012345678", filterByStar: "critical", sortBy: "helpful" },
    format: "json", formatType: "all_formats", mediaType: "media_reviews_only", parserName: "amzReviewV2",
  }]]);
});
