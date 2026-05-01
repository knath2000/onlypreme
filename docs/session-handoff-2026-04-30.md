# OnlyPreme Session Handoff - 2026-04-30

## Product Direction

OnlyPreme is an MVP for small Supreme resellers. The first product surface is a Supreme-only pre-drop page for the SS26 Week 10 drop occurring Thursday, April 30, 2026. The user goal is a practical reseller decision: cop, maybe, or skip, backed by retail, resale estimates, confidence, liquidity, and product details.

The product should earn trust through transparent comps, source labels, prediction snapshots, and post-drop accuracy tracking. Avoid positioning the system as generic AI until it beats simple baselines.

## Website Built

The project started as an empty local folder at `/Users/kalyannath/Projects/onlypreme`. A static MVP was created with:

- `index.html`
- `styles.css`
- `app.js`
- `data/predictions/ghostface-arc-hooded-sweatshirt-2026-04-30.json`

The site runs with:

```sh
python3 -m http.server 4173
```

Local URL:

```text
http://localhost:4173
```

Validation run:

```sh
node --check app.js
```

The app currently provides:

- Supreme SS26 Week 10 droplist.
- Product cards with category, retail, hype, source badges, details, and top-level MVP forecast.
- Ranked table sorted by expected profit by default.
- Search, category, call, and sort filters.
- Product modal with color selection required before resale estimates are shown.
- For the Ghostface Arc Hooded Sweatshirt, color-specific and size-specific estimates loaded from the JSON prediction snapshot.
- Expandable estimates for day 1, 1 week, 1 month, and 1 year.

## Data Sources Used

Primary product/drop source:

- Supreme Drop List Week 10: `https://supremedroplist.com/season/springsummer-2026/week-10`
- Ghostface Arc Hoodie page: `https://supremedroplist.com/items/ghostface-arc-hooded-sweatshirt-ss26`

Retail/color source:

- DropsGG Reddit retail graphic: `https://www.reddit.com/r/supremedrops/comments/1sy3sam/supreme_week_10_full_droplist_retail_prices/`

Drop context:

- Sole Retriever Week 10 preview: `https://www.soleretriever.com/news/articles/supreme-spring-summer-2026-week-10-drop-release-date-april-2026`

Dr. Martens product context:

- Sneaker Bar Detroit: `https://sneakerbardetroit.com/supreme-dr-martens-postal-supreme-release-date/`

Comparable market sources used for the Ghostface Arc Hoodie:

- Supreme Printed Arc Hooded Sweatshirt Black, StockX.
- Supreme Icy Arc Hooded Sweatshirt Black, StockX.
- Supreme Sequin Arc Hooded Sweatshirt Black, StockX.
- Supreme FTP Arc Hooded Sweatshirt Black, StockX.
- Supreme Classic Logo Hooded Sweatshirt Black, StockX.
- Supreme Ghostface Gore-Tex Jacket SS26 Red listing, Grailed, used only as ask-side Ghostface demand signal.

## Important Data Quality Notes

- Supreme Drop List showed the Ghostface Arc Hoodie item page with Black as the listed color.
- The DropsGG/Reddit retail graphic showed Black, Red, and a grey colorway, with retail at `$198`. StockX canonicalizes the grey color as Ash Grey.
- Because Supreme Drop List did not yet canonicalize all colorways, the JSON stores retail confidence as medium and includes a warning to verify colors once the Supreme shop page goes live.
- StockX public page data can mix asks, last sales, stale sales, and outliers. Future critique should prefer completed sales by size/color where available.
- Grailed ask data is not treated as a completed-sale comp.

## Frontend Behavior Decisions

Resale estimates must be color-gated:

- The product modal opens with product facts only.
- The user must select a color before seeing resale estimates.
- The reason is that resale markets treat colorways as separate variants.

For the Ghostface Arc Hoodie:

- Color selection loads stored prediction rows from `data/predictions/ghostface-arc-hooded-sweatshirt-2026-04-30.json`.
- Day 1 estimates are shown first.
- A `details` disclosure expands to show day 1, 1 week, 1 month, and 1 year estimates.

For items without dedicated prediction files:

- The modal still requires color selection.
- It uses a temporary item-level MVP forecast adjusted by a simple color multiplier.
- This should be replaced with color-specific prediction JSON files as the product matures.

## Ghostface Arc Hoodie Prediction Summary

Item:

- Supreme Ghostface Arc Hooded Sweatshirt
- Release date: 2026-04-30
- Retail: `$198`
- Modeled colors: Black, Red, Ash Grey
- Modeled sizes: S, M, L, XL, XXL
- Confidence: medium
- Overall recommendation: selective cop

Day 1 expected sale price by color/size:

| Color | S | M | L | XL | XXL |
|---|---:|---:|---:|---:|---:|
| Black | $260 | $275 | $285 | $295 | $310 |
| Red | $245 | $260 | $270 | $280 | $295 |
| Ash Grey | $300 | $315 | $280 | $270 | $365 |

Best targets:

- Black XXL
- Black XL
- Black L
- Red XXL

Avoid for resale:

- Red S

## Prediction Logic Captured

Base Black Medium was set to `$275`.

Why:

- Recent/active arc hoodie comps support a high-$200s market for strong black arc hoodies.
- Supreme Printed Arc Hoodie Black had a high visible last sale, but it exceeded its visible 12-month range, so it was treated as an outlier.
- Supreme FTP Arc Hoodie and same-season Classic Logo Hoodie were used as downside anchors.
- Ghostface/Scream adds demand, but not enough to model this as a box-logo-level or luxury-level event.
- Retail is high at `$198`, compressing fee-adjusted profit.

Color multipliers:

- Black: strongest liquidity and best theme/wearability balance.
- Red: discounted 5 percent from Black; theme-relevant but less broadly wearable.
- Ash Grey: originally discounted from Black by prior, then revised after live StockX day-1 market data showed Ash Grey trading at or above Black in several sizes.

## Live StockX API Update

After adding billing and shipping to the authenticated StockX account, the StockX developer API worked for catalog search, variants, and market-data.

The market-data response returned size-level ask/bid fields:

- `lowestAskAmount`
- `highestBidAmount`
- `sellFasterAmount`
- `earnMoreAmount`

It did not return completed sales, ask count, bid count, or sales-last-72-hours fields in the tested response.

Live Black and Ash Grey data was captured in:

```text
data/stockx/ghostface-arc-market-data-retry-2026-04-30.json
```

The prediction JSON was updated to use `Ash Grey` instead of `Heather Grey`, use `sellFaster` as live range floor where available, and store live StockX interpretation under `postDropLiveMarketAdjustment`.

A later Red retry succeeded with a fresh OAuth code and slower cadence. Red S and XXL showed high sellFaster/earnMore but no active bids; Red S was downgraded from `cop` to `maybe`. The overall confidence score was raised from `63` to `72` because live StockX data now covers all three colors and five sizes, though completed sales and depth are still unavailable.

Black S was raised on day 1 from live data, but its one-week estimate was trimmed so it does not remain `$20` above Black M after quick-flip inventory appears.

Later horizon critique adjustments:

- Ash Grey M one-year was lowered from `$295` to `$265` because the day-1 premium over Black M is likely transient and historical grey arc comps trade below Black over time.
- Black S one-year was lowered from `$295` to `$285` because day-1 S was already flagged as an opening-hour scarcity spike.
- Red XL one-year was lowered from `$295` to `$285` to avoid assuming full day-1 recovery for a less broadly wearable color.
- Red XXL, Ash Grey S, and Ash Grey XXL received explicit no-bid liquidity notes to match the Red S treatment.

Size premiums:

- S: discount.
- M: baseline.
- L: small premium.
- XL: stronger premium.
- XXL: strongest premium.

Fee math:

```text
net profit = expected sale price * 0.88 - 15 - 198
```

Assumptions:

- 12 percent marketplace fees.
- `$15` shipping/handling.
- Forecast prices are sale prices before seller fees.

## Horizon Logic

The JSON stores horizon estimates for:

- day 1
- 1 week
- 1 month
- 1 year

Model intent:

- Day 1 captures early scarcity and urgency.
- 1 week usually fades slightly as quick-flip supply appears.
- 1 month fades again as drop attention cools.
- 1 year allows collector stabilization, especially for Black and larger sizes.

## Critique Questions Saved In JSON

The prediction JSON includes review questions for a counter-balancing reviewer:

- Should the Printed Arc Hoodie `$472` last sale be excluded entirely rather than only down-weighted?
- Does Ghostface demand deserve a larger boost because the hoodie is one of the more wearable pieces in the capsule?
- Should Red be closer to Black because it visually matches the horror theme, or discounted more because red hoodies are harder to wear?
- Should XXL receive a larger premium if Supreme stock is especially thin in extended sizes?
- Should day 1 estimates be lower because many buyers may chase the mask, skateboard, pendant, or Dr. Martens instead?

## Next Implementation Steps

1. Move droplist data out of `app.js` into JSON files.
2. Create one prediction JSON per item/colorway.
3. Add realized sale ingestion after drop:
   - day 1
   - day 7
   - day 30
   - day 365
4. Add prediction accuracy tracking by:
   - item
   - color
   - size
   - category
   - retail band
   - collab/non-collab
5. Replace generic color multipliers with item-specific comparable sets.
6. Add a critique workflow that reads prediction JSON, writes counter-estimates, and stores reviewer notes next to the original snapshot.

## Memory Note

This session's active memory policy allowed reading memory but not writing new memory entries. The durable project memory for this work is therefore this docs file plus the structured prediction JSON.
