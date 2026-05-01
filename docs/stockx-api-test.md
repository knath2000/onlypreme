# StockX API Test

## Required Credentials

The API key alone is not enough. StockX API calls require:

- `x-api-key`: API key from the developer portal.
- `Authorization: Bearer <access_token>`: OAuth access token.
- Application credentials from the developer portal:
  - client ID / application ID
  - client secret
  - registered redirect URI

Do not commit these values.

## Get A Bearer Access Token

1. Generate the browser authorization URL:

```sh
STOCKX_CLIENT_ID='...' \
STOCKX_REDIRECT_URI='https://your-registered-callback.example/callback' \
node scripts/stockx-auth.mjs authorize-url
```

2. Open the printed URL in a browser, log in to StockX, and approve.

3. StockX redirects to your redirect URI with a `code` query param:

```text
https://your-registered-callback.example/callback?code=...&state=...
```

4. Exchange that code for tokens:

```sh
STOCKX_CLIENT_ID='...' \
STOCKX_CLIENT_SECRET='...' \
STOCKX_REDIRECT_URI='https://your-registered-callback.example/callback' \
STOCKX_AUTH_CODE='code-from-callback-url' \
node scripts/stockx-auth.mjs exchange-code
```

The response should include `access_token`, `refresh_token`, `id_token`, and `token_type`.

5. Refresh later:

```sh
STOCKX_CLIENT_ID='...' \
STOCKX_CLIENT_SECRET='...' \
STOCKX_REFRESH_TOKEN='...' \
node scripts/stockx-auth.mjs refresh
```

## Test Catalog And Market Data

After getting an access token:

```sh
STOCKX_API_KEY='...' \
STOCKX_ACCESS_TOKEN='...' \
STOCKX_QUERY='ghostface arc hooded sweatshirt' \
node scripts/stockx-market-test.mjs
```

The script tests:

- `/v2/catalog/search`
- `/v2/catalog/products/{productId}/variants`
- `/v2/catalog/products/{productId}/variants/{variantId}/market-data`

If market data returns live asks, bids, last sale, and liquidity fields, StockX can replace manual public-page comps. If it returns nulls or 403/404 responses, keep StockX public pages as weak evidence and prioritize other completed-sale sources.

## 2026-04-30 Test Result

OAuth token exchange worked:

- status: `200`
- token type: `Bearer`
- access token received: yes
- refresh token received: yes
- token lifetime: `43200` seconds
- tokens were intentionally not printed or persisted

Catalog search worked for:

```text
/v2/catalog/search?query=ghostface+arc+hooded+sweatshirt&pageNumber=1&pageSize=5
```

It returned three products:

- `316bab94-7b19-429d-b43b-73ecf635df56` - Supreme Ghostface Arc Hooded Sweatshirt Black
- `e31afb4c-66cd-4bd3-b63a-887e0bf433c3` - Supreme Ghostface Arc Hooded Sweatshirt Ash Grey
- `b08aaa27-5727-4b72-89e5-b4f4a514f793` - Supreme Ghostface Arc Hooded Sweatshirt Red

Variant lookup worked for Black and returned sizes S, M, L, XL, and XXL with variant IDs.

Market data was reached but blocked:

```json
{
  "statusCode": 400,
  "errorMessage": "Please setup valid billing and shipping information on www.stockx.com"
}
```

Interpretation:

The endpoint exists and auth is good enough to reach it, but the authenticated StockX account must have valid billing and shipping configured before market data can be tested.

Non-secret result snapshot:

```text
data/stockx/ghostface-arc-api-test-2026-04-30.json
```

## 2026-04-30 Retry After Billing/Shipping Setup

After adding payment method, billing address, and shipping address, the market-data endpoint worked.

OAuth:

- status: `200`
- token type: `Bearer`
- token lifetime: `43200` seconds
- access token received: yes
- refresh token received: yes
- tokens were intentionally not printed or persisted

Market-data result:

- Black variants tested: S, M, L, XL, XXL
- Ash Grey variants tested: S, M, L, XL, XXL
- Market-data successes: `10`
- Market-data failures: `0`
- Red was not captured in this run because the Red catalog query hit HTTP `429` rate limiting after the Black/Ash Grey calls.

Fields returned by `/market-data`:

- `lowestAskAmount`
- `highestBidAmount`
- `flexLowestAskAmount`
- `earnMoreAmount`
- `sellFasterAmount`
- `standardMarketData`
- `flexMarketData`
- `directMarketData`

Fields not present in this response:

- completed-sale history
- `lastSale`
- `numberOfAsks`
- `numberOfBids`
- `salesLast72Hours`

Interpretation:

The API is useful for live size-level ask/bid market data. It does not yet replace completed-sale data for empirical size ratios unless another endpoint or access tier exposes sales history.

Saved non-secret retry result:

```text
data/stockx/ghostface-arc-market-data-retry-2026-04-30.json
```

## Live Market Interpretation

The retry capture occurred around `22:22 UTC` on April 30, roughly seven hours after the Supreme drop. Treat this as real day-1 post-drop market data, not speculative pre-drop listings.

Field usage:

| Field | Use |
|---|---|
| `lowestAskAmount` | Cheapest active listing |
| `highestBidAmount` | Best active buy offer, but can include lowball outliers |
| `sellFasterAmount` | Best live range floor for a motivated seller |
| `earnMoreAmount` | Best live expected-sale or patient-seller ceiling proxy |

Black:

- M/L/XL/XXL validated the original model closely.
- Black M `earnMore` was `$273`, effectively validating the `$275` base.
- Black S was above model with `sellFaster` `$280` and `earnMore` `$308`; it should be watched after one week.
- Black XL highest bid `$140` is treated as a lowball anomaly because `sellFaster` `$277` and `earnMore` `$305` are normal.

Ash Grey:

- StockX canonical color is `Ash Grey`; app and prediction JSON should use that instead of `Heather Grey`.
- Ash Grey materially outperformed the old grey discount.
- Live values were:
  - S: `sellFaster` `$279`, `earnMore` `$307`
  - M: `sellFaster` `$303`, `earnMore` `$334`
  - L: `sellFaster` `$255`, `earnMore` `$281`
  - XL: `sellFaster` `$246`, `earnMore` `$271`
  - XXL: `sellFaster` `$349`, `earnMore` `$384`
- Ash Grey XL is the cleanest validation point because it has ask `$247`, bid `$230`, and only a `$17` spread.
- Ash Grey S and XXL have no bid, so their high values may reflect thin supply more than confirmed demand.

Red:

- A fresh OAuth code and slower single-color request cadence succeeded.
- Live values were:
  - S: `sellFaster` `$303`, `earnMore` `$334`, no active bid
  - M: `sellFaster` `$229`, `earnMore` `$252`, bid `$170`
  - L: `sellFaster` `$272`, `earnMore` `$300`, bid `$190`
  - XL: `sellFaster` `$275`, `earnMore` `$303`, bid `$199`
  - XXL: `sellFaster` `$347`, `earnMore` `$382`, no active bid
- Red M is weak relative to the rest of Red. Red L/XL look validated. Red S/XXL have high upside but no active bid, so treat them as thin-supply signals.
- Red S was downgraded from `cop` to `maybe` despite strong expected profit because no active bid existed at capture. It should upgrade only if a bid appears above roughly `$270`.
- Red XXL, Ash Grey S, and Ash Grey XXL also had no active bids and now carry explicit liquidity notes in the prediction JSON.


Saved Red retry result:

```text
data/stockx/ghostface-arc-red-market-data-2026-04-30.json
```

Combined target fixture for offline scaffolding:

```text
data/stockx/ghostface-arc-target-2026-04-30.json
```

This file merges Black, Ash Grey, and Red into the shape produced by `scripts/stockx-target-pull.mjs`.
