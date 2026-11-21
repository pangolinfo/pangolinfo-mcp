import { test } from "node:test";
import assert from "node:assert/strict";
import { PangolinfoClient } from "../src/client.js";
import { collectEcommerceData, ECOMMERCE_PLATFORMS } from "../src/tools/collect_ecommerce_data.js";
import { searchNaverCafe } from "../src/tools/search_naver_cafe.js";

test("all 14 public ecommerce routes and the archived Cafe tool forward the Java contract and customer auth", async () => {
  const calls: {url:string;body:any;headers:Record<string,string>}[] = [];
  const client = new PangolinfoClient({apiKey:"customer-key",baseUrl:"https://test.invalid",fetchImpl:async(url,init)=>{
    calls.push({url:String(url),body:JSON.parse(init!.body as string),headers:init!.headers as Record<string,string>});
    return new Response(JSON.stringify({code:0,message:"ok",pointCost:0.8,data:{results:[]}}),{status:200});
  }});
  const ctx = {client,logger:{info(){},error(){}}};
  for (const platform of ECOMMERCE_PLATFORMS) for (const operation of ["reviews","product-detail"] as const) {
    await collectEcommerceData.execute(collectEcommerceData.inputSchema.parse({platform,operation,country:platform==="naver"?"KR":"US",productId:"1731028847597097308"}),ctx);
    const call=calls.at(-1)!;
    assert.equal(call.url,`https://test.invalid/api/v1/ecommerce/${platform}/${operation}`);
    assert.equal(call.body.productId,"1731028847597097308");
    assert.equal("platform" in call.body,false);
    assert.equal("operation" in call.body,false);
  }
  await searchNaverCafe.execute(searchNaverCafe.inputSchema.parse({keyword:"로보락",commentPage:20,commentPages:1}),ctx);
  assert.equal(calls.length,15);
  assert.equal(calls.at(-1)!.body.country,"KR");
  assert.equal(calls.at(-1)!.body.commentPage,20);
  for(const call of calls) {
    assert.equal(call.headers.Authorization,"Bearer customer-key");
    assert.equal(call.headers["X-Timeout-Ms"],call.url.endsWith("/naver-cafe/posts") ? "230000" : "90000");
    assert.equal(call.headers["X-API-Key"],undefined);
  }
});

test("unsupported routes and TikTok pagination are rejected",()=>{
  assert.equal(collectEcommerceData.inputSchema.safeParse({platform:"coupang",country:"KR",productId:"123"}).success,false);
  assert.equal(collectEcommerceData.inputSchema.safeParse({platform:"shopify",country:"US"}).success,false);
  assert.equal(collectEcommerceData.inputSchema.safeParse({platform:"tiktok",country:"US",productId:"123",page:2}).success,false);
  assert.equal(searchNaverCafe.inputSchema.safeParse({keyword:"로보락",commentPage:21}).success,false);
});

test("pageSize outside the per-storefront limit is rejected locally",()=>{
  for (const input of [
    {platform:"walmart",country:"US",productId:"123",pageSize:20},
    {platform:"samsclub",productId:"123",pageSize:20},
    {platform:"target",productId:"123",pageSize:51},
    {platform:"naver",productId:"123",pageSize:31},
    {platform:"bestbuy",country:"US",productId:"123",pageSize:21},
  ] as const) assert.equal(collectEcommerceData.inputSchema.safeParse(input).success,false,JSON.stringify(input));
  for (const input of [
    {platform:"walmart",country:"CA",productId:"123",pageSize:100},
    {platform:"walmart",country:"US",productId:"123",pageSize:10},
    {platform:"samsclub",productId:"123",pageSize:10},
    {platform:"target",productId:"123",pageSize:50},
    {platform:"naver",productId:"123",pageSize:30},
    {platform:"bestbuy",country:"CA",productId:"123",pageSize:100},
    {platform:"bestbuy",country:"US",productId:"123",pageSize:20},
    {platform:"costco",country:"US",productId:"123",pageSize:100},
    {platform:"tiktok",productId:"123",page:1,pageSize:5},
  ] as const) assert.equal(collectEcommerceData.inputSchema.safeParse(input).success,true,JSON.stringify(input));
});

test("Product supports seven platforms and rejects review-only or fixed parameters", async () => {
  const calls: any[] = [];
  const ctx: any = {client:{post:async (...args:any[])=>{ calls.push(args); return {code:0,pointCost:0.8}; }},logger:{info(){}}};
  for (const platform of ECOMMERCE_PLATFORMS) {
    const input = collectEcommerceData.inputSchema.parse({platform,operation:"product-detail",country:platform === "naver" ? "KR" : "US",productId:"123"});
    await collectEcommerceData.execute(input, ctx);
    assert.equal(calls.at(-1)[0], `/api/v1/ecommerce/${platform}/product-detail`);
  }
  for (const extra of [{platform:"shopify"},{page:1},{allowStale:true},{platform:"walmart",pricingStoreId:"3991"}])
    assert.equal(collectEcommerceData.inputSchema.safeParse({platform:"target",operation:"product-detail",country:"US",productId:"123",...extra}).success,false);
  assert.equal(collectEcommerceData.inputSchema.safeParse({platform:"target",operation:"product-detail",country:"US",productId:"123",pricingStoreId:"3991"}).success,false);
});

test("Cafe client accepts 140-second responses and aborts at 245 seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  let delay = 140_000;
  const client = new PangolinfoClient({ apiKey: "test", baseUrl: "https://test.invalid", fetchImpl: async (_url, init) => {
    signal = init!.signal as AbortSignal;
    return new Promise<Response>((resolve, reject) => {
      signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      setTimeout(() => resolve(new Response(JSON.stringify({ code: 0, data: { results: [] } }))), delay);
    });
  } });
  const ctx = { client, logger: { info() {}, error() {} } };
  const input = searchNaverCafe.inputSchema.parse({ keyword: "test" });
  const response = searchNaverCafe.execute(input, ctx);
  t.mock.timers.tick(139_999);
  assert.equal(signal!.aborted, false);
  t.mock.timers.tick(1);
  assert.deepEqual(await response, { code: 0, data: { results: [] } });
  delay = 300_000;
  const timeout = assert.rejects(searchNaverCafe.execute(input, ctx), /245s/);
  t.mock.timers.tick(244_999);
  assert.equal(signal!.aborted, false);
  t.mock.timers.tick(1);
  await timeout;
});
