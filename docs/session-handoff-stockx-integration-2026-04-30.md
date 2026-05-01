# OnlyPreme Session Handoff — StockX API Integration (2026-04-30)

## What This Session Accomplished

This session took the Ghostface Arc Hoodie prediction from a hand-calibrated static estimate to a live-API-anchored prediction backed by real drop-day market data. It also designed and built the full StockX data pipeline for future drops.

---

## StockX API Integration

### Auth

- OAuth2 + PerimeterX (browser-based human login step required).
- `scripts/stockx-auth.mjs` handles `authorize-url`, `exchange-code`, and `refresh` commands.
- Access token TTL: 12 hours. Refresh token TTL: 30 days.
- Every request needs both headers: `Authorization: Bearer <JWT>` and `x-api-key: <key>`.
- **Billing and shipping must be on the StockX developer account** — market-data returns 400 without it.
- Credentials always via env vars: `STOCKX_API_KEY`, `STOCKX_ACCESS_TOKEN`, `STOCKX_CLIENT_ID`, `STOCKX_CLIENT_SECRET`, `STOCKX_REFRESH_TOKEN`.
- **Never put keys in chat or code. Use a `.env` file that is not committed to git.**

### Working Endpoints

```
/v2/catalog/search?query=...&pageNumber=1&pageSize=5
/v2/catalog/products/{productId}/variants
/v2/catalog/products/{productId}/variants/{variantId}/market-data
```

### Key Market-Data Fields

| Field | Use in predictions |
|---|---|
| `earnMoreAmount` | `expectedSaleUsd` anchor — patient-seller suggested price |
| `sellFasterAmount` | `rangeUsd[0]` floor — undercut suggested price |
| `highestBidAmount` | Demand confirmation; **can be null** (null = no active buyer) |
| `lowestAskAmount` | Supply signal (secondary) |

**All money fields are strings** — must `parseFloat()` before arithmetic.

### Rate Limiting

- Limit: ~10 rapid calls before 429. Applies to search, variants, and market-data calls alike.
- Fix: 500ms+ delay after every API call.
- Retry pattern: wait 60 seconds, then re-run with `--colors "Red"` only (merge-on-retry in target-pull script).

### What the API Cannot Provide

- Completed sales history / last sale price
- Ask or bid count (depth)
- Sales velocity (last 72 hours)
- Price trajectory over time

Completed sales must be manually scraped from eBay "Sold Listings" by size.

---

## Drop-Day Results (Ghostface Arc Hoodie SS26)

Live StockX data captured on drop day (2026-04-30 ~22:22 UTC, ~7 hours post-drop).

- **Black and Ash Grey**: All 5 sizes — lowestAsk, highestBid, sellFaster, earnMore all returned.
- **Red**: Captured on retry after 429. S and XXL had no active bids (highestBidAmount null).

Raw data files:

```
data/stockx/ghostface-arc-market-data-retry-2026-04-30.json   (Black + Ash Grey)
data/stockx/ghostface-arc-red-market-data-2026-04-30.json     (Red)
data/stockx/ghostface-arc-target-2026-04-30.json              (merged target pull)
```

Known StockX product IDs:

| Color | Product ID |
|---|---|
| Black | `316bab94-7b19-429d-b43b-73ecf635df56` |
| Ash Grey | `e31afb4c-66cd-4bd3-b63a-887e0bf433c3` |
| Red | `b08aaa27-5727-4b72-89e5-b4f4a514f793` |

---

## Prediction JSON Changes (Schema v0.2)

The Ghostface hoodie prediction JSON was upgraded from the initial hand-authored version to schema v0.2.

### New Root Fields

- `"schemaVersion": "0.2"`
- `"accuracyTracking"` block with `oneWeek`, `oneMonth`, `oneYear` placeholders (all null until post-drop tracker runs)

### Model Changes

- `stockxApiMarketData` renamed to `targetMarketData` — same structure, cleaner name, now script-generated.
- `compDerivedRatios` block added — all null until `stockx-comp-pull.mjs` is run.
- `scaffoldMeta` added under `model.method`.

### Per day1Predictions Entry New Fields

```json
"scaffoldBasis": "earnMore",
"hasBid": true,
"bidAskSpreadUsd": 12,
"liquidityNote": null,
"analystOverride": null,
"analystOverrideReason": null
```

### Corrections Made This Session

1. **Color naming**: "Heather Grey" → "Ash Grey" (StockX canonical name) throughout prediction JSON and app.js.
2. **Red multiplier**: 0.93 → 0.97 based on live earnMore showing Red close to Black.
3. **Ash Grey multiplier**: 0.89 → 0.97 because live earnMore showed Ash Grey at or above Black in several sizes (live override applied, flagged in JSON).
4. **Confidence score**: Raised 63 → 72 after live API data covers all 3 colors × 5 sizes.
5. **Red S call**: Downgraded cop → maybe; no active bid at capture (liquidityNote added).
6. **Black S 1-week**: Trimmed $285 → $270 to correct opening-hour S-over-M inversion.
7. **Horizon fades differentiated**: No longer mechanical uniform −$10; now vary by color, size, and bid presence.
8. **Ash Grey M 1-year**: Lowered $295 → $265; day-1 Ash Grey premium over Black is transient; historical grey arc comps trade 0.64–0.72× Black at 1 year.
9. **Black S 1-year**: Lowered $295 → $285; day-1 S spike flagged as opening-hour scarcity.
10. **Red XL 1-year**: Lowered $295 → $285; full day-1 recovery overstates long-term Red demand.
11. **Liquidity notes**: Added to Red XXL, Ash Grey S, Ash Grey XXL (hasBid=false same as Red S).

---

## Scripts Built This Session

All scripts are Node.js ES modules, no npm packages, credentials via env vars.

### `scripts/stockx-client.mjs` — shared HTTP client

Exports: `requireCreds()`, `stockxGet()`, `delay()`, `parseMoney()`, `searchProduct()`, `getVariants()`, `getMarketData()`.

The `delay()` call must fire after **every** API call — search and variants count against rate limit, not just market-data.

### `scripts/stockx-target-pull.mjs` — pull all colors × sizes for a drop item

```sh
STOCKX_API_KEY=... STOCKX_ACCESS_TOKEN=... \
  node scripts/stockx-target-pull.mjs \
  --item "Supreme Ghostface Arc Hooded Sweatshirt" \
  --colors Black Red "Ash Grey" \
  --date 2026-04-30 \
  --out data/stockx/ghostface-arc-target-2026-04-30.json
```

If `--out` file already exists, merges new colors in (does not overwrite). Use this for 429 retries.

### `scripts/scaffold-prediction.mjs` — generate draft prediction JSON

```sh
node scripts/scaffold-prediction.mjs \
  --target data/stockx/ghostface-arc-target-2026-04-30.json \
  --comps  data/stockx/comps/arc-hoodie-comps-2026-04-30.json \
  --item   scripts/configs/ghostface-arc-hoodie.json \
  --out    data/predictions/ghostface-arc-hooded-sweatshirt-2026-04-30.json
```

Day-1 prediction logic:
```
expectedSaleUsd = earnMoreUsd
rangeUsd        = [sellFasterUsd, round(earnMoreUsd × 1.05)]
netProfit       = expectedSaleUsd × 0.88 − 15 − retail
call (draft)    = cop   if netProfit ≥ 40 AND hasBid
                  maybe if netProfit ≥ 15
                  skip  if netProfit < 15
```

Prints a numbered TODO list to stdout so the analyst knows exactly what fields need manual judgment.

### `scripts/stockx-comp-pull.mjs` — pull comp items; derive size + color ratios

```sh
STOCKX_API_KEY=... STOCKX_ACCESS_TOKEN=... \
  node scripts/stockx-comp-pull.mjs \
  --config scripts/configs/arc-hoodie-comps.json \
  --out data/stockx/comps/arc-hoodie-comps-2026-04-30.json
```

Computes median `earnMore[size] / earnMore[M]` and median `earnMore[color] / earnMore[Black]` across all comps. Median is used (not mean) to be robust against outliers like the Printed Arc $472 last-sale anomaly.

**Has not been run yet.** `compDerivedRatios` in the prediction JSON are all null until this runs.

### `scripts/stockx-track-accuracy.mjs` — post-drop accuracy tracker

```sh
STOCKX_API_KEY=... STOCKX_ACCESS_TOKEN=... \
  node scripts/stockx-track-accuracy.mjs \
  --prediction data/predictions/ghostface-arc-hooded-sweatshirt-2026-04-30.json \
  --horizon    oneWeek \
  --out        data/accuracy/ghostface-arc-hooded-sweatshirt-oneweek-2026-05-07.json
```

Valid `--horizon` values: `day1` | `oneWeek` | `oneMonth` | `oneYear`

Re-pulls stored variant IDs. Compares live `sellFasterUsd` to horizon prediction. Accuracy: ≤10% = accurate, ≤20% = close, beyond ±20% = miss_high / miss_low. Patches `accuracyTracking` back into the prediction JSON.

**Next run date: 2026-05-07 (T+7d).**

### Config Files

`scripts/configs/ghostface-arc-hoodie.json` — item config: retail, colors, sizes, fees, call thresholds.
`scripts/configs/arc-hoodie-comps.json` — comp list: Icy Arc FW20, Sequin Arc SS19, FTP Arc SS21, Printed Arc FW24.

---

## Prediction Methodology Established

### Day-1 Predictions
- `expectedSaleUsd` = `earnMoreUsd` from StockX API
- `rangeUsd[0]` = `sellFasterUsd`
- `rangeUsd[1]` = `round(earnMoreUsd × 1.05)`
- `netProfitAfterFeesUsd` = `expectedSaleUsd × 0.88 − 15 − retail`

### Horizon Prediction Rules
- Day-1 → 1-week fades: −$20 to −$30 for no-bid variants; −$10 for liquid two-sided markets.
- 1-week → 1-month fades: typically smaller than day-1 → week fades.
- 1-year recoveries scale with size (XXL most, S least) and with Black being most durable color.
- Grey should end below Black at 1 year (historical comp ratios 0.64–0.72× Black).
- Variants with no active bid should have `liquidityNote` set.

### Confidence Score (now 72)
- Increases with: completed sales by size/color, confirmed colorways, tight bid-ask spreads, multi-source demand.
- Decreases with: null bids, ask-only comps, no size-specific data, unconfirmed colors, stale comps.

### Fee Math
```
netProfit = expectedSaleUsd × 0.88 − 15 − retail
```
12% StockX marketplace fee, $15 shipping/handling. Grailed is 9% (≈$7 more per $275 sale).

### Call Thresholds (schema v0.2)
- `cop`: netProfit ≥ $40 AND hasBid = true
- `maybe`: netProfit ≥ $15 (or cop threshold not met)
- `skip`: netProfit < $15

---

## Analyst Workflow Established

### Pre-Drop (T−2 to T−7 days)
1. Create `scripts/configs/[item-slug].json`
2. Create or reuse `scripts/configs/[category]-comps.json`
3. Run `stockx-comp-pull.mjs` → empirical size + color ratios

### Drop Day
4. Run `stockx-target-pull.mjs` ~30 min before drop (pre-drop ask stack)
5. Run `stockx-target-pull.mjs` 1–3 hours after drop (day-1 market formation)
6. If 429: wait 60s, re-run with `--colors "Red"` (file merges automatically)
7. Run `scaffold-prediction.mjs` → draft JSON with 15 day-1 predictions pre-filled
8. Analyst opens JSON, searches `"TODO"`, fills in: reasoning, horizon estimates, eBay comps, critique questions

### Post-Drop
9. T+7d (2026-05-07): `stockx-track-accuracy.mjs --horizon oneWeek`
10. T+30d (2026-05-30): `stockx-track-accuracy.mjs --horizon oneMonth`
11. T+1yr (2027-04-30): `stockx-track-accuracy.mjs --horizon oneYear`

---

## Open Items for Next Session

### Horizon Fixes (quick edits in prediction JSON)
None remain — all 4 identified issues were corrected this session (Ash Grey M 1-year, Black S 1-year, Red XL 1-year, missing liquidityNotes).

### Data Gaps
1. **Run comp pull** — `stockx-comp-pull.mjs` has not been run. `compDerivedRatios` are all null in the prediction JSON. Run against: Icy Arc FW20, Sequin Arc SS19, FTP Arc SS21, Printed Arc FW24.
2. **eBay completed sales** — no size-specific completed-sale comps collected yet. Manual scraping needed.
3. **Accuracy tracking** — first window opens T+7d (2026-05-07). Run `stockx-track-accuracy.mjs --horizon oneWeek`.

### Architecture (lower priority)
- Droplist hardcoded in app.js — 21 items should move to JSON.
- Only 1 detailed prediction JSON exists — 20 other items still use generic MVP formula.
- Token refresh not automated — 12-hour access token requires manual re-auth.

---

## Security Note

An API key was accidentally shared in chat during this session. **That key must be rotated immediately** via the StockX developer portal. Going forward, all credentials must live in a `.env` file that is not committed to git. Use env var pattern: `STOCKX_API_KEY=... node scripts/...`
