# Session handoff — Liquid Glass Carnival redesign (2026-04-30)

## What changed

Complete UI redesign of the OnlyPreme Next.js app. **CSS-only** — zero React component changes. All work lives in [`app/globals.css`](../app/globals.css).

## Direction

"Liquid Glass Carnival" — vivid gradient mesh background + macOS 26 liquid-glass material, minimalist where possible, **must perform on older Intel Macs** (iGPU-friendly).

## Key design decisions

### Performance budget (non-negotiable for Intel iGPUs)

- `backdrop-filter` is used on **exactly two surfaces**: the sticky `.topbar` and `dialog::backdrop`. Both at `blur(10px) saturate(160%)`.
- Cards, panels, and pills use **translucent fill + gradient ring border** via a `::before` pseudo-element with `mask-composite: exclude`. Reads as glass without the GPU cost of blur.
- No `filter:` on large elements. The 56px brand logo is the only exception (dark-mode invert).
- Single-layer `box-shadow`. No multi-stack shadows.
- No animated gradients. No `will-change`. Animations are transform/opacity only.
- `background-attachment: fixed` on body — the gradient mesh paints once and doesn't repaint on scroll.
- `prefers-reduced-motion` killswitch at the bottom of the file.

### Color tokens

**Brand gradient** powers the GET PRO pill, gradient-clipped eyebrow text, color-picker selected state, and the auth panel ring:
```
--grad-primary: linear-gradient(135deg, #ff6ec4 0%, #7873f5 50%, #4f9dff 100%);
```

**Call gradients** (each with matching colored outer shadow):
- COP: `#00e0a4 → #009fff` (mint → cyan)
- MAYBE: `#ffb84c → #ff5f7e` (amber → coral)
- SKIP: `#8b94b3 → #3d4359` (slate)

**Background mesh** (both themes, three radial gradients): pink top-right, indigo top-left, cyan bottom. Dark mode is deep navy with bright aurora; light mode is warm cream/peach.

### Layout — table → card grid via CSS only

The main `.ranked` view in [`app/only-preme-app.tsx`](../app/only-preme-app.tsx) still emits a normal `<table>`. CSS overrides flip it to a card grid:

```css
.ranked thead { display: none; }
.ranked tbody {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.ranked tbody tr {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  /* card styling, gradient fill, padding, rounded corners */
}
.ranked tbody tr:nth-child(even) { background: var(--grad-card-warm); }
.ranked tbody td:nth-child(2)::before { content: "Retail"; }
/* ...labels for 7D / 30D / Profit / Confidence / Call */
```

`.size-table` inside dialogs is excluded from the override and stays a real table.

### Geometry / typography

- Radii: `--radius-sm: 10px`, `md: 16`, `lg: 22`, `xl: 28`, `pill: 999`
- Font: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, ...`
- Heading letter-spacing: `-0.025em` general, `-0.035em` on the hero
- Antialiased rendering enabled

## Process notes

### Worktree gotcha

The user's dev server runs from `/Users/kalyannath/Projects/onlypreme/` but Claude operated in a worktree at `/Users/kalyannath/Projects/onlypreme/.claude/worktrees/elastic-buck-f9c764/`. Edits in the worktree are invisible to a dev server running from the main checkout.

**Resolution**: copy changed files to the main checkout (or merge the branch). For future redesigns, prefer working directly in the main checkout when the goal is "see it in dev right now."

## Verification

- `npm run build` passes (Next.js 15.3, ~12s build time, no new warnings)
- Toggle Light/Dark via the topbar button to confirm both themes
- Test responsive at 900px and 560px breakpoints — at <560px the in-card stat grid collapses to 3 columns
- The card view should feel materially different from the screenshots in the original brief: gradient ring borders, vivid call pills, alternating warm/cool card fills

## Files touched

- [`app/globals.css`](../app/globals.css) — full rewrite (~600 lines)

## Files NOT touched

- All `.tsx` components, all routes, all `lib/*`, all data files. Pure CSS pass.

## Next steps (suggested)

- A11y pass: confirm gradient text on `.eyebrow` meets contrast against the gradient mesh background
- Test on a real Intel Mac to confirm the perf budget held; if `dialog::backdrop` blur stutters on first open, drop to `blur(6px)`
- Consider replacing the hero photo URL (currently a Reddit-hosted image) with a self-hosted asset before heavy traffic
