# Alexa marketplace routing

`search_amazon_alexa` accepts optional `site: "us" | "jp"` (default `us`). It forwards top-level `site` to the existing Java V2 route. Japan requires the backend site's account pool to be configured; it never borrows US accounts.

Normal requests use `scrapeContext.alexaMode: "direct"`, backed by the full native HTTP parser. `screenshot: true` explicitly selects `playwright`. Results retain `content`, `products`, `follow_up_questions` and the per-turn `sources` list (label, domain and article URL); missing upstream recommendations are not invented.

Prompts in one call share a conversation. Separate calls start new threads (screenshot requests open a new Rufus chat first, so an earlier conversation is never shown or continued). Billing is 6 points per answered prompt. Timeout remains 240 seconds in the tool; client timeout should be at least 120 seconds. Timing depends on account initialization and upstream response, not a fixed 60–90 second promise.

Rollout dependency: deploy the Java top-level `site` DTO addition and the browser service routing change before releasing this MCP change. A previous Java binary ignores unknown fields, which could otherwise silently route a Japan request to the US. Other countries are not exposed by this tool until separately validated and enabled.

## Refusals (2026-10-16)

Rufus sometimes streams part of an answer and then declines (`unsupported_query_error` with an `error_soft_landing` section such as 「その質問にはお答えできません。」). The partial text is not returned. The turn carries `status: "refused"` and `refusal_message`; other turns are `answered` or `failed`. Only answered turns are billed. If no turn is answered and Amazon declined, Java returns `9207` and this tool reports `ALEXA_REFUSED` (not billed, not retriable).

Rollout order: browser service (adds `status` / `REFUSED`) → Java (`9207`, per-turn settlement) → MCP. An older Java treats the browser `REFUSED` response as `9200`, which is still unbilled.
