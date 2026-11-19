# Amazon video collection

`get_amazon_videos` calls `POST /api/v1/amazon/videos` with `asin`, `country` (US default; US/UK/DE/FR/IT/ES/JP/CA/AU), and optional PDP `zipcode`. No parser name, format or internal upstream parameters are required.

The API returns `data.mainMedia` (groups, titles, counts, authors, URLs, original creator types and labels), `data.aplus` (Premium hero videos, MP4/HLS and position), and `data.productVideos` (all entries in the current PDP module, preserving native fields). Basic A+ does not support videos. All hero calls and data-a-state configurations are read, including repeated aplus container IDs. Unknown position headings retain their original text.

Each source is one snapshot. Lists must not be summed or used to replace one another; the popup is an anonymous marketplace view and the optional postcode only applies to the PDP. Creator identities and displayed disclosure evidence are separate fields. `Vendor`/`Seller` map to `merchant`, `Influencer` to `influencer`, `Customer` to `customer`; other types stay `unknown`. No competitor ownership is inferred from related ASINs.

Successful snapshots, including normal empty regions, cost 1 point. Upstream failures, identity mismatch and cancellation release reservations; partial results are not returned as success. A local MCP wait budget of 115 seconds does not change the backend deadline. The backend finishes or times out within 100 seconds; it also inherits the configured xscrape read timeout (default 60 seconds).

REST documentation: `https://docs.pangolinfo.com/en-api-reference/amazonApi/videos` (available after the pending release is deployed). This change does not deploy either service.
