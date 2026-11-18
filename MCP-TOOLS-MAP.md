# Pangolinfo MCP tool map

Version 0.10.0: 21 registered tools (20 business tools plus free local introspection).

## Discovery

Call `pangolinfo_capabilities()` first. `tools/list` provides the actual input schemas. Both transports expose the same catalog.

## Workflows

| Goal | Tool sequence |
| --- | --- |
| Amazon product research | search_amazon → get_amazon_product → get_amazon_reviews → calculate_amazon_profit |
| Category discovery | search_categories → get_category_children → get_category_paths → list_category_products |
| Category/niche analytics | filter_categories → filter_niches → get_amazon_product |
| Seller research | get_amazon_product → list_seller_products |
| Rankings | list_bestsellers → list_new_releases → keyword_trends |
| External demand | keyword_trends → ai_search |
| Ecommerce feedback | collect_ecommerce_data(product-detail) → collect_ecommerce_data(reviews) |
| Competing offers | scrape_url(parserName=amzFollowSeller) |
| Alexa research | search_amazon_alexa / get_amazon_alexa_questions |

Profit calculation accepts US/JP only and costs a fixed 5 points per successful call; its response does not include pointCost. Missing pointCost does not mean free. Ecommerce Product returns details plus aggregate ratings at 0.8 points/product; Reviews costs 0.8 points/unique review. The complete 21-tool catalog is in README.md; billing follows the underlying REST contract and pointCost where returned.

## Boundaries

Social collectors, Naver Cafe, V3 maps/WIPO/PACER, callbacks and asynchronous task interfaces are not registered. Source files retained in src/tools are historical implementations, not available tools. Account registration and billing stay outside the MCP tool surface.

## Response semantics

Preserve backend fields, including pointCost when present; do not invent absent fields. Profit product-not-found (8000) is unbilled and terminal. Profit timeout/transport/HTTP 5xx failures have unknown completion and billing, so do not automatically retry. The profit tool waits up to 180 seconds locally; gateway limits still apply. Explicit missing ASINs (9204) and confirmed redirects (9206) follow the corresponding API billing and are not automatically retried. Alexa refusals (9207) are unbilled. Ecommerce confirmed invalid resources cost 0.8 points; local validation errors, timeouts, service failures and valid empty reviews are free.
