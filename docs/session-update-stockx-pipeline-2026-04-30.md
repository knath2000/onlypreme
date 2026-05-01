# OnlyPreme StockX Pipeline Update - 2026-04-30

## Summary

This session turned the one-off Ghostface Arc Hoodie prediction workflow into a reusable StockX-backed pipeline. The system can now pull target item market data by color and size, scaffold draft prediction JSON, pull comp market data for ratios, and track future prediction accuracy.

## StockX API Outcome

OAuth worked with the StockX developer app:

- API key plus Bearer token are both required.
- OAuth authorization code exchange succeeded.
- Billing/shipping setup was required before market-data would return.
- Tokens were intentionally not printed or persisted.

Working API capabilities:

- `/v2/catalog/search`
- `/v2/catalog/products/{productId}/variants`
- `/v2/catalog/products/{productId}/variants/{variantId}/market-data`

Market-data fields returned:

- `lowestAskAmount`
- `highestBidAmount`
- `sellFasterAmount`
- `earnMoreAmount`
- `flexLowestAskAmount`
- standard/flex/direct market data blocks

Fields not returned in this access tier:

- completed sale history
- last sale
- ask count
- bid count
- sales last 72 hours

## Files Added

Scripts:

- `scripts/stockx-client.mjs`
- `scripts/stockx-target-pull.mjs`
- `scripts/scaffold-prediction.mjs`
- `scripts/stockx-comp-pull.mjs`
- `scripts/stockx-track-accuracy.mjs`

Configs:

- `scripts/configs/ghostface-arc-hoodie.json`
- `scripts/configs/arc-hoodie-comps.json`

Data:

- `data/stockx/ghostface-arc-target-2026-04-30.json`
- `data/stockx/comps/arc-hoodie-comps-mock.json`
- `data/stockx/ghostface-arc-red-market-data-2026-04-30.json`

Updated:

- `data/predictions/ghostface-arc-hooded-sweatshirt-2026-04-30.json`
- `docs/prediction-methodology.md`
- `docs/stockx-api-test.md`
- `docs/session-handoff-2026-04-30.md`

## Pipeline Behavior

`stockx-client.mjs` provides shared helpers:

- `requireCreds()`
- `stockxGet()`
- `delay()`
- `parseMoney()`
- `searchProduct()`
- `getVariants()`
- `getMarketData()`
- `normalizeMarketData()`

Important rule: delay happens after every API call, including search and variant calls.

`stockx-target-pull.mjs`:

- Pulls all colors and sizes for a target item.
- Writes normalized market data.
- Merges retries by color so a rate-limited color can be re-run without overwriting previous colors.

`scaffold-prediction.mjs`:

- Generates schema v0.2 prediction drafts.
- Uses `earnMore` as expected sale.
- Uses `sellFaster` as range floor.
- Uses `round(earnMore * 1.05)` as range ceiling.
- Computes fee-adjusted profit.
- Pre-fills `cop/maybe/skip`.
- Leaves analyst TODOs as valid JSON strings or `null` plus `*_todo` flags.

Draft call logic:

```text
cop   if profit >= cop threshold and has bid
cop   if profit >= maybe threshold, has bid, and bid/ask spread <= 15
maybe if profit >= maybe threshold
skip  otherwise
```

`stockx-comp-pull.mjs`:

- Pulls comp items and colors.
- Computes median size ratios relative to M.
- Computes median color ratios relative to Black.
- Uses medians to reduce outlier sensitivity.

`stockx-track-accuracy.mjs`:

- Re-pulls market data from stored variant IDs.
- Compares live `sellFasterUsd` against chosen horizon prediction.
- Classifies each variant as `accurate`, `close`, `miss_high`, or `miss_low`.
- Writes a report and patches `accuracyTracking` back into the prediction JSON.

## Ghostface Hoodie Final State

The prediction JSON is now schema `0.2`.

It includes:

- `model.method.targetMarketData`
- `model.method.compDerivedRatios`
- scaffold fields on day-one prediction rows
- `accuracyTracking`
- analyst revisions and critique notes

Current key prediction updates:

- Color name aligned to StockX canonical `Ash Grey`.
- Day-1 values use live StockX market data.
- Range floors use live `sellFaster`.
- No-bid variants carry liquidity notes.
- `confidenceScore` is `72`.

Final important call/risk changes:

- Red S changed from `cop` to `maybe` because no active bid existed.
- Red M remains `skip`.
- Red L/XL are validated `cop` candidates.
- Red S/XXL and Ash Grey S/XXL are high-upside but thin-supply/no-bid signals.
- Black S one-week and one-year values were trimmed to avoid preserving an opening-hour scarcity spike.
- Ash Grey M one-year was lowered below Black M one-year to avoid projecting a transient day-one grey premium into long-term value.
- Red XL one-year was lowered to keep a conservative long-term color discount.

Specific horizon critique revisions:

- Ash Grey M one-year: `$295` to `$265`
- Black S one-year: `$295` to `$285`
- Red XL one-year: `$295` to `$285`

## Verification Performed

Commands/tests run:

```sh
node --check app.js
node --check scripts/stockx-client.mjs
node --check scripts/stockx-target-pull.mjs
node --check scripts/scaffold-prediction.mjs
node --check scripts/stockx-comp-pull.mjs
node --check scripts/stockx-track-accuracy.mjs
```

Offline scaffold validation passed:

- Black M expected `$273`
- Black M range `[$248, $287]`
- Black M profit `$27`
- Black M draft call `cop`
- Red M draft call `skip`
- Ash Grey XXL liquidity note present
- Ash Grey live override flag true

## Next Steps

1. Use `stockx-target-pull.mjs` for the next Supreme item instead of manually assembling target data.
2. Run `stockx-comp-pull.mjs` with live credentials for arc hoodie comps to replace the mock comp ratios.
3. Add a UI indicator for no-bid/thin-supply estimates.
4. Add UI distinction between scaffolded values and analyst overrides.
5. Run `stockx-track-accuracy.mjs` at T+7 days for the one-week horizon.
6. Keep completed-sale data as a separate future integration because the current StockX API response does not include sale history.
