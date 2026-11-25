import { test } from "node:test";
import assert from "node:assert/strict";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getAmazonReviews } from "../src/tools/get_amazon_reviews.js";

test("review schema exposes Netherlands/Poland/Belgium and preserves the existing fourteen sites", () => {
  const sites = [
    "amz_us", "amz_de", "amz_uk", "amz_jp", "amz_fr", "amz_it", "amz_es", "amz_br",
    "amz_au", "amz_mx", "amz_in", "amz_eg", "amz_ae", "amz_ca", "amz_nl", "amz_pl", "amz_be",
  ];
  const schema = zodToJsonSchema(getAmazonReviews.inputSchema) as any;
  assert.deepEqual(schema.properties.site.enum, sites);
  for (const site of sites) {
    assert.equal(getAmazonReviews.inputSchema.parse({ asin: "B012345678", site }).site, site);
  }
  assert.equal(getAmazonReviews.inputSchema.parse({ asin: "B012345678" }).site, "amz_us");
  // 沙特站评论接口尚未开放
  assert.throws(() => getAmazonReviews.inputSchema.parse({ asin: "B012345678", site: "amz_sa" }));
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

// 2026-10-15 上游新增意/西/巴三站；2026-11-25 新增荷/波/比三站。示例 ASIN 取自 Randy 提供的上线 curl
for (const [site, domain, asin] of [
  ["amz_it", "www.amazon.it", "B0DN67T63N"],
  ["amz_es", "www.amazon.es", "B0FDB3Y1YT"],
  ["amz_br", "www.amazon.com.br", "B089Y5NKDR"],
  ["amz_nl", "www.amazon.nl", "B0CV4XQP29"],
  ["amz_pl", "www.amazon.pl", "B0FQTVXYGQ"],
  ["amz_be", "www.amazon.com.be", "B0BZVVL3WM"],
] as const) {
  test(`${site} review request maps to ${domain} with the two-page example`, async () => {
    const calls: any[] = [];
    const result = { data: { json: [{ data: { results: [{ asin }] } }] } };
    const ctx = { logger: { info() {} }, client: { post: async (...args: any[]) => { calls.push(args); return result; } } } as any;
    const input = getAmazonReviews.inputSchema.parse({ asin: asin.toLowerCase(), site, pageCount: 2 });
    assert.equal(await getAmazonReviews.execute(input, ctx), result);
    assert.deepEqual(calls, [["/api/v1/scrape", {
      url: `https://${domain}`, site: "",
      bizContext: { bizKey: "review", pageCount: 2, asin, filterByStar: "all_stars", sortBy: "recent" },
      format: "json", formatType: "all_formats", mediaType: "all_contents", parserName: "amzReviewV2",
    }]]);
  });
}

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

test("review output preserves native dates, actual countries and unknown empty fields", async () => {
  for (const [site, date, country] of [
    ["amz_jp", "2026年7月16日", "日本"],
    ["amz_es", "1 de noviembre de 2026", "España"],
    ["amz_br", "20 de outubro de 2026", "Brasil"],
    ["amz_eg", "11 July 2023", "United Arab Emirates"],
    ["amz_jp", "", ""],
  ] as const) {
    const result = { data: { json: [{ data: { results: [{ date, country }] } }] } };
    const ctx = { logger: { info() {} }, client: { post: async () => result } } as any;
    const input = getAmazonReviews.inputSchema.parse({ asin: "B073JWXGNT", site });
    assert.equal(await getAmazonReviews.execute(input, ctx), result);
  }
});
