import { test } from "node:test";
import assert from "node:assert/strict";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getAmazonReviews } from "../src/tools/get_amazon_reviews.js";

test("review schema exposes Japan and preserves the existing nine sites", () => {
  const sites = ["amz_us", "amz_de", "amz_uk", "amz_jp", "amz_au", "amz_mx", "amz_in", "amz_eg", "amz_ae", "amz_ca"];
  const schema = zodToJsonSchema(getAmazonReviews.inputSchema) as any;
  assert.deepEqual(schema.properties.site.enum, sites);
  for (const site of sites) {
    assert.equal(getAmazonReviews.inputSchema.parse({ asin: "B012345678", site }).site, site);
  }
  assert.equal(getAmazonReviews.inputSchema.parse({ asin: "B012345678" }).site, "amz_us");
  assert.throws(() => getAmazonReviews.inputSchema.parse({ asin: "B012345678", site: "amz_fr" }));
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
