# Prediction Methodology

## Goal

OnlyPreme predictions should help small Supreme resellers decide whether to cop, maybe, or skip an item before the drop.

The system should show:

- expected sale price by color and size
- time horizon estimates
- fee-adjusted profit
- confidence
- liquidity
- comparable data
- explicit reasoning and critique notes

## Required Product Variant Flow

Predictions must be variant-aware.

At minimum:

```text
item -> color -> size -> horizon
```

The frontend should not show resale estimates until the user selects a color. Color is required because colorways trade as separate markets.

For apparel, size should be included in the estimate table. For one-size items, size can be stored as `OS`.

## Prediction Snapshot Shape

Every serious forecast should be stored as a snapshot before the drop.

Required fields:

- item identity
- release date
- retail price and retail source confidence
- colors modeled
- sizes modeled
- product source URLs
- market comps
- model name/version
- fee assumptions
- day 1 predictions
- horizon predictions
- color-level summaries
- detailed reasoning
- critique questions
- key risks

The Ghostface Arc Hoodie snapshot is the current reference implementation:

```text
data/predictions/ghostface-arc-hooded-sweatshirt-2026-04-30.json
```

## Baseline Model

Start with a transparent comparable-weighted baseline.

Do not start with opaque ML. The user wants trust and accuracy tracking first.

The baseline should consider:

- item category
- retail price
- colorway
- size
- logo strength
- collab strength
- hype or sentiment
- comparable completed sales
- active asks only as weak signals
- liquidity and expected buyer pool
- seasonality and drop competition

## Comps Rules

Prefer:

- same category
- same brand
- recent Supreme seasons
- completed sales
- same or similar color
- same or similar size
- similar retail band
- similar logo/collab strength

Down-weight:

- stale comps
- ask-only listings
- outlier last sales
- unrelated categories
- items with very different retail prices
- items from very different hype eras

For critique, each comp should include why it was included.

## Fee Math

Current MVP assumption:

```text
net profit = expected sale price * 0.88 - shipping/handling - retail
```

Current values:

```text
marketplace fee = 12 percent
shipping/handling = $15
```

These should become configurable later.

## Horizon Logic

Use four default horizons:

- day 1
- 1 week
- 1 month
- 1 year

General behavior:

- Day 1 can be elevated by scarcity and hype.
- 1 week usually fades as quick-flip inventory appears.
- 1 month often fades further as attention moves to later drops.
- 1 year may stabilize or recover for genuinely collectible, wearable, scarce variants.

Long-horizon estimates should have lower confidence than day 1 and 1 week.

## Color Logic

Color should be modeled separately.

Common assumptions:

- Black usually has the broadest liquidity.
- Grey is wearable but can be less urgent unless graphics are especially strong.
- Red can be theme-relevant but less broadly wearable.
- Loud colors can spike if they are visually iconic, but otherwise need discounts.
- Camo, snakeskin, and graphic colorways can outperform basics when the item is novelty-driven.

These are only priors. Actual item comps should override them.

## Size Logic

For Supreme apparel:

- S usually receives a discount.
- M is often the baseline.
- L often gets a small premium.
- XL and XXL often receive the strongest premium due to demand and tighter supply.

This should be validated per category and per item.

## Confidence

Confidence should increase with:

- completed sales comps by exact category
- color-specific comps
- size-specific comps
- confirmed retail
- confirmed color list
- consistent multi-source demand
- strong historical category liquidity

Confidence should decrease with:

- unconfirmed colors
- retail from unofficial graphics only
- ask-only comps
- low trade volume
- unusual retail price
- niche item category
- high drop competition

## Critique Workflow

Each prediction JSON should be designed for another reviewer to critique.

Include:

- assumptions
- comp rationale
- excluded or down-weighted data
- data quality warnings
- review questions
- model version

The critic should write:

- counter-estimate
- disputed assumptions
- added comps
- removed comps
- confidence adjustment
- final recommendation delta

## Current Known Gaps

- Droplist data still lives inside `app.js`.
- Only the Ghostface Arc Hoodie has a detailed prediction JSON.
- Most item cards use generic MVP estimates.
- No database exists yet.
- No reviewer/counter-prediction storage exists yet.

## StockX Pipeline

The StockX integration now has reusable scripts:

- `scripts/stockx-client.mjs`: shared authenticated client, delay, money parsing, search, variants, market-data helpers.
- `scripts/stockx-target-pull.mjs`: pulls target item colors and size variants, merges color retries into one file.
- `scripts/scaffold-prediction.mjs`: generates schema v0.2 draft prediction JSON from target data and optional comp ratios.
- `scripts/stockx-comp-pull.mjs`: pulls comp item market data and derives median color/size ratios.
- `scripts/stockx-track-accuracy.mjs`: re-pulls variant market data for a prediction and patches `accuracyTracking`.

Target pull example:

```sh
STOCKX_API_KEY='...' STOCKX_ACCESS_TOKEN='...' STOCKX_DELAY_MS=600 \
node scripts/stockx-target-pull.mjs \
  --item "Supreme Ghostface Arc Hooded Sweatshirt" \
  --colors Black Red "Ash Grey" \
  --date 2026-04-30 \
  --out data/stockx/ghostface-arc-target-2026-04-30.json
```

Scaffold example:

```sh
node scripts/scaffold-prediction.mjs \
  --target data/stockx/ghostface-arc-target-2026-04-30.json \
  --comps data/stockx/comps/arc-hoodie-comps-mock.json \
  --item scripts/configs/ghostface-arc-hoodie.json \
  --out data/predictions/ghostface-arc-hooded-sweatshirt-2026-04-30.json
```

Accuracy example:

```sh
STOCKX_API_KEY='...' STOCKX_ACCESS_TOKEN='...' \
node scripts/stockx-track-accuracy.mjs \
  --prediction data/predictions/ghostface-arc-hooded-sweatshirt-2026-04-30.json \
  --horizon oneWeek \
  --out data/accuracy/ghostface-arc-hooded-sweatshirt-oneweek-YYYY-MM-DD.json
```

Schema v0.2 additions:

- root `schemaVersion`
- `model.method.targetMarketData`
- `model.method.compDerivedRatios`
- day-one scaffold fields: `scaffoldBasis`, `hasBid`, `bidAskSpreadUsd`, `analystOverride`, `analystOverrideReason`
- root `accuracyTracking`

The scaffold intentionally leaves analyst judgment fields as valid JSON TODO strings or `null` plus `*_todo` flags. It should never output invalid bare TODO tokens.
