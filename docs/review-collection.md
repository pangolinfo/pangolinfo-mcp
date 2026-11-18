# Ecommerce Product and Reviews

`collect_ecommerce_data` exposes `product-detail` and `reviews` for Walmart, Costco, Best Buy, Sam's Club, Target, Naver Shopping and TikTok Shop. Requests use the customer's Pangolinfo Bearer key and post to `/api/v1/ecommerce/{platform}/{operation}`.

Product combines `data.product` details with `data.productSummary` ratings, at 0.8 points/product. Reviews returns `data.results`, at 0.8 points/unique review. Product has no pagination or allowStale. Shopify and the legacy product-summary operation are outside this MCP catalog; use Product for ratings. REST backends remain unchanged.

Provide productId or productUrl. Walmart/Costco/Best Buy require country. Sam's Club/Target/TikTok Shop default to US, and Naver Shopping defaults to KR. Fixed-country callers can omit country. Only Naver accepts originProductId/merchantId/storeSlug. TikTok Shop returns five recommended reviews; omit sort and pagination. Other pagination follows the corresponding platform REST API.

Explicitly confirmed invalid IDs/URLs or missing products cost 0.8 points and remain errors. Local validation errors, timeouts, service failures and valid empty reviews are free. Separate requests are billed separately. Inspect pointCost, error, ratingMeta, ratingWarnings and missingFields rather than inferring missing data.

The client allows the 90-second ecommerce deadline plus 15 seconds for delivery. There are no callback or asynchronous task parameters. Social and Naver Cafe tools are not registered in this MCP.

Verification: npm run typecheck, npm run build, node --import tsx --test tests/*.test.ts.
