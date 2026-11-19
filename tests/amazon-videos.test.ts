import { test } from "node:test";
import assert from "node:assert/strict";
import { getAmazonVideos } from "../src/tools/get_amazon_videos.js";
import { PangolinfoClient } from "../src/client.js";
import { tools } from "../src/tools/index.js";

test("video tool sends only public inputs and preserves independent placement counts", async () => {
  let body: unknown;
  let path: string | undefined;
  const result = { code: 0, pointCost: 1, data: { mainMedia: { count: 16 }, aplus: { count: 1 }, productVideos: { count: 10 } } };
  const client = new PangolinfoClient({ apiKey: "offline-key", baseUrl: "https://offline.invalid", fetchImpl: async (url, init) => {
    path = String(url); body = JSON.parse(init!.body as string);
    return new Response(JSON.stringify(result), { status: 200 });
  } });
  const input = getAmazonVideos.inputSchema.parse({ asin: "b0bvb2sdgr", zipcode: "10041" });
  assert.equal(input.country, "US");
  assert.deepEqual(await getAmazonVideos.execute(input, { client, logger: { info() {}, error() {} } }), result);
  assert.equal(path, "https://offline.invalid/api/v1/amazon/videos");
  assert.deepEqual(body, { asin: "B0BVB2SDGR", country: "US", zipcode: "10041" });
  assert.ok(tools.some(tool => tool.name === "get_amazon_videos"));
  assert.throws(() => getAmazonVideos.inputSchema.parse({ asin: "INVALID" }));
  assert.throws(() => getAmazonVideos.inputSchema.parse({ asin: "B0BVB2SDGR", country: "XX" }));
});
