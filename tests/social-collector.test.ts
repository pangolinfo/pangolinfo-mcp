import { test } from "node:test";
import assert from "node:assert/strict";
import { zodToJsonSchema } from "zod-to-json-schema";
import { collectSocialData } from "../src/tools/collect_social_data.js";
import { SOCIAL_COLLECTOR_KEYS } from "../src/tools/social_collector_keys.js";
import { PangolinfoClient } from "../src/client.js";

test("46 operations use public fields and an internal deadline without supplier credentials", async () => {
  const calls: {url: string; body: Record<string, unknown>; headers: Record<string,string>}[] = [];
  const client = new PangolinfoClient({apiKey: "customer-key", baseUrl: "https://test.invalid", fetchImpl: async (url, init) => {
    calls.push({url:String(url),body:JSON.parse(init!.body as string),headers:init!.headers as Record<string,string>});
    return new Response(JSON.stringify({code:0,data:{},pointCost:0.8}),{status:200});
  }});
  assert.equal(SOCIAL_COLLECTOR_KEYS.length,46);
  for (const api of SOCIAL_COLLECTOR_KEYS) {
    const input=collectSocialData.inputSchema.parse({api,target:'  example  ',options:{retries:0,maxComments:999,maxItems:999,maxHits:999,unknown:'ignored'},timeoutMs:1});
    await collectSocialData.execute(input,{client,logger:{info(){},error(){}}});
  }
  assert.equal(calls.length,46);
  for (const call of calls) {
    assert.equal(call.headers.Authorization,'Bearer customer-key');
    assert.equal(call.headers['X-Timeout-Ms'],'75000');
    assert.equal(call.body.target,'example');
    assert.equal('timeoutMs' in call.body,false);
    assert.deepEqual(call.body.options ?? {},{});
  }
});

test("operation-specific fields are filtered before validation, including malformed hidden fields", () => {
  assert.deepEqual(collectSocialData.inputSchema.parse({api:'reddit-home',target:'x',options:{limit:'ignored',maxPages:-1,maxItems:999,tab:'submitted'}}),
    {api:'reddit-home',target:'x',options:{tab:'submitted'}});
  assert.deepEqual(collectSocialData.inputSchema.parse({api:'youtube-works',target:'x',options:{includeAbout:'ignored',includeFeatured:123,cursor:'  opaque+/=  '}}),
    {api:'youtube-works',target:'x',options:{cursor:'  opaque+/=  '}});
  assert.deepEqual(collectSocialData.inputSchema.parse({api:'reddit-search',target:'x',options:{type:'comment',restrictSr:true,pageSize:100,maxPages:9}}),
    {api:'reddit-search',target:'x',options:{maxPages:5}});
  for(const api of ['youtube-comments','reddit-comments','facebook-comments','tiktok-comments']) {
    const value=collectSocialData.inputSchema.parse({api,target:'x',options:{commentId:'parent',maxPages:99,cursor:'opaque',includeReplies:false,maxRepliesPerComment:200,maxDepth:9,expandMore:3}});
    assert.deepEqual('options' in value ? value.options : null,{maxPages:5,cursor:'opaque',commentId:'parent'});
  }
});

test("page and limit boundaries, topic normalization and public include exceptions", () => {
  for(const value of [0,-1,1.5,'2',true,null]) assert.equal(collectSocialData.inputSchema.safeParse({api:'reddit-search',target:'x',options:{maxPages:value}}).success,false);
  assert.deepEqual(collectSocialData.inputSchema.parse({api:'reddit-works',target:'x',options:{limit:999}}),{api:'reddit-works',target:'x',options:{limit:100}});
  for(const topics of [' product, ,refund, ',[' product ','','refund']]) {
    assert.deepEqual(collectSocialData.inputSchema.parse({api:'trustpilot-comments',target:'x',options:{topics,includeTopics:true}}),
      {api:'trustpilot-comments',target:'x',options:{topics:['product','refund']}});
  }
  assert.equal(collectSocialData.inputSchema.safeParse({api:'trustpilot-comments',target:'x',options:{topics:'1,2,3,4,5,6,7,8,9,10,11'}}).success,false);
  assert.equal(collectSocialData.inputSchema.safeParse({api:'trustpilot-comments',target:'x',options:{topics:[1]}}).success,false);
  assert.deepEqual(collectSocialData.inputSchema.parse({api:'trustpilot-post',target:'x',options:{includeTopics:false}}),{api:'trustpilot-post',target:'x',options:{includeTopics:false}});
  assert.deepEqual(collectSocialData.inputSchema.parse({api:'youtube-home',target:'x',options:{includeAbout:true,includeFeatured:true}}),{api:'youtube-home',target:'x',options:{includeAbout:true,includeFeatured:true}});
});

test("published JSON Schema is an object with public fields and no internal controls", () => {
  const schema=zodToJsonSchema(collectSocialData.inputSchema,{$refStrategy:'none'}) as {type?:string;properties?:Record<string,unknown>};
  assert.equal(schema.type,'object');
  assert.ok(schema.properties?.target);
  assert.ok(schema.properties?.options);
  const text=JSON.stringify(schema);
  for(const field of ['timeoutMs','maxComments','maxItems','maxHits','retries','maxRepliesPerComment','maxDepth','expandMore','includeReplies']) {
    assert.equal(text.includes('"'+field+'":'),false,field);
  }
});

test("removed operations and invalid targets fail before issuing requests", async () => {
  for(const api of ['stats','resolve','reddit-profile','pinterest-search']) assert.equal(collectSocialData.inputSchema.safeParse({api,target:'x'}).success,false);
  for(const target of ['', '  ', 'x'.repeat(2049), 1]) assert.equal(collectSocialData.inputSchema.safeParse({api:'reddit-search',target}).success,false);
  let requests=0;
  const client=new PangolinfoClient({apiKey:'key',baseUrl:'https://test.invalid',fetchImpl:async()=>{requests++;return new Response('{}');}});
  await assert.rejects(()=>collectSocialData.execute({api:'reddit-comments'} as never,{client,logger:{info(){},error(){}}}));
  assert.equal(requests,0);
});
