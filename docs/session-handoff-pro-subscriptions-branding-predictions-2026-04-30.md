# OnlyPreme Pro Subscriptions, Branding, and Prediction Expansion - 2026-04-30

## Summary

This session expanded OnlyPreme from a subscription-gated prediction MVP into a more complete testable product surface:

- Added detailed analyst prediction snapshots for several Week 10 droplist items.
- Created a Supabase admin/pro test user for protected prediction testing.
- Added Stripe Checkout subscription purchase flow at `$0.99/month`.
- Added Stripe webhook handling that writes to the existing `public.subscriptions` table.
- Replaced the text mark with the exact provided OnlyPreme logo asset.
- Added a persisted dark mode toggle.

The work is local and currently uncommitted.

## Prediction Expansion

The user asked to replicate the Ghostface Arc Hoodie analyst workflow sequentially for other droplist items, stopping after each item for confirmation.

The workflow used:

- StockX target market pulls where available.
- Schema `0.2` prediction JSON.
- Live `earnMore` as day-1 expected sale when trustworthy.
- `sellFaster` as the day-1 range floor.
- Analyst overrides where market data was missing, no-bid, ask-only, taxonomy-only, or illiquid.
- Horizon rows for day 1, 1 week, 1 month, and 1 year.
- Color-level summaries, best targets, avoid notes, key risks, and confidence scores.

Prediction files added:

```text
data/predictions/dr-martens-postal-supreme-2026-04-30.json
data/predictions/ghostface-mask-2026-04-30.json
data/predictions/minolta-camcorder-2026-04-30.json
data/predictions/ghostface-pendant-2026-04-30.json
data/predictions/alice-skateboard-2026-04-30.json
```

StockX target captures added:

```text
data/stockx/dr-martens-postal-target-2026-04-30.json
data/stockx/ghostface-mask-target-2026-04-30.json
data/stockx/minolta-camcorder-target-2026-04-30.json
data/stockx/ghostface-pendant-target-2026-04-30.json
data/stockx/alice-skateboard-target-2026-04-30.json
```

Config files added:

```text
scripts/configs/dr-martens-postal.json
scripts/configs/dr-martens-comps.json
scripts/configs/ghostface-mask.json
scripts/configs/ghostface-accessory-comps.json
scripts/configs/minolta-camcorder.json
scripts/configs/supreme-electronics-comps.json
scripts/configs/ghostface-pendant.json
scripts/configs/supreme-jacob-comps.json
scripts/configs/alice-skateboard.json
scripts/configs/supreme-skateboard-comps.json
```

`data/droplist.json` was updated so each prediction-backed item points at its new JSON through `predictionFile`.

## Important Prediction Notes

Dr. Martens Postal:

- Uses Black and Snakeskin, US sizes `6` through `13`, retail `$198`.
- Confidence set lower than apparent profit because target StockX pages had no visible completed-sale history and spreads were wide.
- No-bid variants were downgraded to `maybe`.

Ghostface Mask:

- Both Red Bandana and Black Bandana had active StockX bid support and tight spreads.
- Both remained `cop`; Black Bandana was strongest.

Minolta Camcorder:

- Pink Camo was the selective `cop`.
- Woodland Camo was `maybe` because projected profit existed but high retail, hardware-value risk, and moderate spread lowered confidence.

Ghostface Pendant:

- The target StockX response had no ask-side scaffold values and only a `$600` bid against very high retail.
- Analyst estimate marked it `skip` for resale despite collector appeal.

Alice Skateboard:

- StockX canonicalized the item as `Supreme Alice Skateboard Deck Multicolor`.
- The app has `Black` and `Graphic`; `Graphic OS` maps directly to StockX, while `Black OS` is a conservative taxonomy/display row.
- `Graphic OS` was `cop`; `Black OS` was `maybe`.

## StockX Client Patch

`scripts/stockx-client.mjs` was adjusted so one-size StockX variants with blank labels fall back to `"OS"`:

```js
size: variant.variantValue || variant.sizeChart?.defaultConversion?.size || "OS"
```

This matters for accessories and one-size items such as masks, pendant, camcorder, and skateboard.

## Supabase Admin Test User

The user requested a main admin/pro test account:

```text
knath2000@icloud.com
```

Created/confirmed in Supabase Auth with:

- `app_metadata.role = admin`
- `app_metadata.plan = pro`
- active subscription row in `public.subscriptions`

The password was provided by the user in-chat. Do not store it in repo docs or memory.

## Stripe Pro Subscription Flow

Stripe plugin was used to create:

```text
Product: prod_UQzhSkM6gBwEs1
Price: price_1TS7iYBlEcaRurIYizBfYsJG
Amount: $0.99/month
```

Important: the Stripe connector returned `livemode: true`, so this is a live 99-cent monthly price, not test-mode.

Files added:

```text
lib/stripe.ts
app/api/stripe/checkout/route.ts
app/api/stripe/webhook/route.ts
```

Files updated:

```text
app/only-preme-app.tsx
lib/supabase/server.ts
.env.example
package.json
package-lock.json
```

User flow:

1. User signs in through Supabase magic link.
2. Signed-in non-Pro user sees `Get Pro · $0.99/mo`.
3. Button posts to `/api/stripe/checkout`.
4. Checkout session uses `mode: "subscription"`.
5. Stripe redirects back to `/?checkout=success`.
6. Stripe webhook upserts `public.subscriptions`.
7. Existing `/api/predictions/[itemId]` gate unlocks when status is `active` or `trialing`.

Required environment variables:

```text
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRO_PRICE_ID=price_1TS7iYBlEcaRurIYizBfYsJG
```

Required Stripe webhook endpoint:

```text
https://your-domain.com/api/stripe/webhook
```

Webhook events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Local smoke check:

- Unsigned-out `POST /api/stripe/checkout` redirects to `/login`.

## Logo and Branding

The user provided the exact logo file:

```text
/Users/kalyannath/Downloads/output-onlinepngtools.png
```

It was copied unchanged to:

```text
public/onlypreme-logo.png
```

The logo is a `1672 x 941` RGBA PNG with a transparent background.

Alpha verification showed:

```json
{
  "transparent": 1462014,
  "partial": 0,
  "opaque": 111338
}
```

The header and login page now use the logo through CSS:

```css
background: url("/onlypreme-logo.png") center / contain no-repeat;
```

## Dark Mode

Dark mode was added as a persisted user-facing toggle:

- Toggle appears in the top bar.
- Button label flips between `Dark` and `Light`.
- Preference persists in `localStorage` under `onlypreme-theme`.
- `app/layout.tsx` includes a small pre-hydration script that applies the saved theme to `document.documentElement.dataset.theme`.
- `app/globals.css` defines light and dark CSS variables.

Dark mode coverage includes:

- body background
- sticky top bar
- cards
- tables and hover states
- forms and selects
- prediction panels
- modal
- image wells
- pills/badges
- source sections
- subscription gate banner

The exact PNG logo has dark lettering, so dark mode gives the logo a subtle light logo surface for readability.

## Validation

Repeated validation after changes:

```sh
npm run lint
npm run build
```

Current known result:

- `npm run lint` passes with 7 existing warnings.
- `npm run build` passes.

Known lint warnings:

- Three `<img>` warnings in `app/only-preme-app.tsx`.
- Three unused imports in `scripts/ebay-comp-sold-pull.mjs`.
- One unused `median` import in `scripts/scaffold-prediction.mjs`.

## Current Local Dev Notes

Port `3000` was already in use during testing, so the dev server was started on:

```text
http://localhost:3001
```

The logo asset was verified locally at:

```text
http://localhost:3001/onlypreme-logo.png
```

## Open Next Steps

Recommended next steps:

1. Add production `STRIPE_*` and `SUPABASE_SERVICE_ROLE_KEY` environment variables in Vercel.
2. Add the production Stripe webhook endpoint and copy its signing secret into Vercel.
3. Run one end-to-end checkout test with a non-admin user.
4. Verify webhook-created `public.subscriptions` rows unlock prediction JSON.
5. Continue sequential analyst prediction generation from the next droplist item when requested.
6. Consider adding a Stripe customer portal route for cancellation/payment-method management.
7. Consider replacing remaining `<img>` tags with `next/image` once the product-image domain strategy is stable.
