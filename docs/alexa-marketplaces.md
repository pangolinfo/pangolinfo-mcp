# Alexa marketplace routing

`search_amazon_alexa` accepts optional `site: "us" | "jp"` (default `us`). It forwards top-level `site` to the existing Java V2 route. Japan requires the backend site's account pool to be configured; it never borrows US accounts.

Normal requests use `scrapeContext.alexaMode: "direct"`, backed by the full native HTTP parser. `screenshot: true` explicitly selects `playwright`. Results retain `content`, `products` and `follow_up_questions`; missing upstream recommendations are not invented.

Prompts in one call share a conversation. Separate calls start new threads. Billing remains 6 points per prompt. Timeout remains 240 seconds in the tool; client timeout should be at least 120 seconds. Timing depends on account initialization and upstream response, not a fixed 60–90 second promise.

Rollout dependency: deploy the Java top-level `site` DTO addition and the browser service routing change before releasing this MCP change. A previous Java binary ignores unknown fields, which could otherwise silently route a Japan request to the US. Other countries are not exposed by this tool until separately validated and enabled.
