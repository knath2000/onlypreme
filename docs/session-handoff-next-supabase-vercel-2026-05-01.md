# OnlyPreme Next.js/Supabase Migration Handoff - 2026-05-01

## Summary

OnlyPreme was migrated from a static HTML/CSS/JS MVP to a Next.js 15 App Router application with Supabase SSR auth and subscription-gated prediction access. The migration was pushed to GitHub for Vercel deployment.

Repository:

```text
https://github.com/knath2000/onlypreme.git
```

Published commit:

```text
bd72f3022d2379c0b4c6f762ffc436606ce4c8d5
feat: migrate to next supabase app
```

## Current Architecture

Frontend:

- `app/page.tsx` loads the droplist and auth/subscription state server-side.
- `app/only-preme-app.tsx` contains the interactive droplist UI, filters, cards, modal, and prediction display.
- `app/globals.css` replaces the old static `styles.css`.
- `index.html`, `app.js`, and the root `styles.css` were removed.

Data:

- Public droplist data remains in `data/droplist.json`.
- Prediction JSON remains under root `data/predictions/`.
- In Next.js, root `data/` is not directly web-served. Verified old direct URL access returns `404`:

```text
/data/predictions/ghostface-arc-hooded-sweatshirt-2026-04-30.json
```

Protected prediction access:

- Route: `app/api/predictions/[itemId]/route.ts`
- Requires a Supabase-authenticated user.
- Requires an active or trialing row in `public.subscriptions`.
- Validates that the prediction file path starts with `data/predictions/` and ends with `.json`.
- Reads prediction JSON server-side and returns it with `cache-control: no-store`.

Auth:

- Login page: `/login`
- Login component: `app/login/login-form.tsx`
- Magic-link callback: `app/api/auth/callback/route.ts`
- Sign-out route: `app/auth/sign-out/route.ts`
- Supabase helpers:
  - `lib/supabase/client.ts`
  - `lib/supabase/server.ts`
  - `lib/supabase/middleware.ts`
  - `middleware.ts`
- Subscription helper: `lib/subscriptions.ts`

## Supabase State

Supabase CLI:

- Installed with Homebrew.
- Binary: `/usr/local/bin/supabase`
- Version: `2.95.4`
- Local Docker runtime is not available/running, so local `supabase start/status` cannot run until Docker, OrbStack, Rancher Desktop, or another Docker-compatible runtime is available.

Hosted Supabase project:

```text
name: onlypreme
ref: tduvhhsmivrvemoxuwuu
dashboard: https://supabase.com/dashboard/project/tduvhhsmivrvemoxuwuu
```

Migration:

```text
supabase/migrations/20260501012822_subscription_gate.sql
```

Migration creates:

- `public.subscriptions`
- RLS enabled
- indexes on `user_id` and `status`
- select policy allowing authenticated users to read only their own subscriptions

The migration was pushed to the hosted Supabase project and verified remotely. `public.subscriptions` exists.

Auth config was pushed for local redirects:

```text
http://localhost:3000
http://localhost:3000/api/auth/callback
http://127.0.0.1:3000
http://127.0.0.1:3000/api/auth/callback
```

Local `.env` was updated with Supabase values but was not committed. Vercel must be configured with:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Add the Vercel production and preview URLs to Supabase Auth redirect allow-list before testing production magic links.

## Validation Performed

Commands:

```sh
npm run lint
npm run build
supabase db push
supabase migration list --linked
supabase db query --linked "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'subscriptions';"
```

Results:

- `npm run lint` passes with warnings only.
- `npm run build` passes.
- `supabase db push` applied `20260501012822_subscription_gate.sql`.
- Remote migration list shows local and remote migration versions match.
- Remote query confirmed `public.subscriptions`.
- `/api/predictions/ghostface-arc-hoodie` returned `401` once Supabase was configured, proving the API is no longer in the earlier `503 Supabase is not configured` state.
- `/login` rendered with the magic-link form.
- Old direct prediction JSON URL returned `404`.

Known warnings:

- Next lint warns about plain `<img>` usage in `app/only-preme-app.tsx`.
- Some legacy analysis scripts have unused imports.
- `npm install` earlier reported two moderate vulnerabilities; no forced audit fix was applied.

## Deployment Notes

Vercel should deploy from:

```text
GitHub repo: knath2000/onlypreme
branch: main
```

Required Vercel environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Recommended Vercel settings:

- Framework preset: Next.js
- Build command: `npm run build`
- Install command: `npm install`
- Output directory: leave default

After deployment:

1. Add the Vercel production URL to Supabase Auth redirect URLs.
2. Add the Vercel preview URL pattern or specific preview URLs if magic links need to work on previews.
3. Create a test user.
4. Insert an active or trialing `public.subscriptions` row for that user.
5. Log in and verify the Ghostface Arc Hoodie detailed prediction unlocks.

## Completed-Sales Research Context

The completed-sales research plan was discussed but not executed in that turn.

Chosen plan:

- API-first acquisition.
- Start with Ghostface Arc Hoodie.
- Store output as JSON files.

Completed sales should be treated as actual transaction evidence, especially for:

- validating `expectedSaleUsd`
- deriving size ratios relative to M
- deriving color ratios relative to Black
- distinguishing liquid profit from ask-only or no-bid upside
- adjusting forecast confidence

Recommended output files:

```text
data/completed-sales/ghostface-arc-hoodie-2026-04-30.json
data/completed-sales/comps/arc-hoodie-comps-2026-04-30.json
```

Each completed-sale row should store:

- source
- title
- URL
- sold date
- sold price
- shipping
- currency
- condition
- parsed color
- parsed size
- variant match confidence
- rejection reason for uncertain or excluded rows

The repo already contains eBay-related scripts:

- `scripts/ebay-client.mjs`
- `scripts/ebay-sold-pull.mjs`
- `scripts/ebay-comp-sold-pull.mjs`

These require `EBAY_APP_ID`.

StockX API market-data in the current access tier is not completed-sale history. It remains live ask/bid/sellFaster/earnMore context.

## Next Steps

Immediate:

1. Deploy `main` on Vercel.
2. Add Vercel env vars.
3. Add Vercel redirect URLs in Supabase Auth.
4. Create a test user and active subscription row.
5. Verify protected prediction unlocks after login.

Near term:

1. Add Stripe Checkout/webhook flow to write `public.subscriptions`.
2. Move prediction snapshots from local JSON to Supabase tables or storage-backed protected fetches when pipeline writes need to happen remotely.
3. Run completed-sales collection for Ghostface Arc Hoodie and arc hoodie comps.
4. Re-score confidence and size/color ratios from completed-sale evidence.
5. Add price-history graph tables and UI after the auth/subscription path is stable.
