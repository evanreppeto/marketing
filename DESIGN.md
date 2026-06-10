# Design System: Signal (Big Shoulders Growth Engine)

## 1. Visual Theme & Atmosphere

A dark operations command center: layered navy surfaces, a single blue "signal" accent, restoration red reserved for priority/decision moments, and dense-but-readable operating modules. Surfaces step up in lightness (canvas → panel → inset → raised) so modules visibly lift off the background. Executive and field-aware, instrument-like — not developer-first, not a neon dashboard.

Tokens live in `src/app/globals.css` (`:root`) and the reusable React class contract lives in `src/app/_components/theme.ts`. Always build from those sources rather than hard-coding new hex values, one-off tone aliases, or local button/pill class maps.

## 2. Color Palette & Roles (OKLCH, tinted toward brand hue ~248)

- **Canvas** `--canvas` — page background, deepest navy.
- **Surface / Panel** `--surface-panel` — cards and modules (use the `.signal-panel` class or the `Panel` primitive).
- **Inset** `--surface-inset` — panel headers, form fields, sub-blocks inside a panel.
- **Soft** `--surface-soft` — quiet list/strip backgrounds.
- **Raised** `--surface-raised` — hover, popovers, selected.
- **Text** `--text-primary` / `--text-secondary` / `--text-muted` — three legible tiers.
- **Borders** `--border-hairline` / `--border-panel` / `--border-strong`.
- **Accent (signal blue)** `--accent` / `--accent-strong` / `--accent-soft` — active nav, links, primary non-destructive actions, focus rings.
- **Priority (restoration red)** `--priority` / `--priority-bright` — decision-required, primary CTAs, destructive/out-of-scope state.
- **Status** `--ok` (green), `--warn` (amber) — calibrated for dark surfaces.
- **Elevation** `--elev-panel` / `--elev-raised` — dark, faintly blue-tinted shadows.

Max one accent + one priority hue. No purple/neon, no pure black/white.

## 3. Typography

Loaded via `next/font` in `src/app/layout.tsx`; exposed as Tailwind families.

- **Display:** Archivo (`font-display`, `--ff-display`) — engineered grotesk, tight tracking, weight-driven hierarchy. Headings, the Signal wordmark, key metrics.
- **Body:** Hanken Grotesk (`font-sans`, `--ff-body`) — warm humanist grotesk, relaxed leading, ~65–74ch max for explanatory copy.
- **Mono:** JetBrains Mono (`font-mono`, `--ff-mono`) — identifiers, scores, timestamps, tabular metrics (`tabular-nums`).
- **Banned:** Inter, generic serifs, system-default-only stacks, gradient text, monospace as lazy "tech" shorthand.

## 4. Component Stylings

- **Panel** (`.signal-panel`): 0.75rem radius, 1px `--border-panel`, panel surface + subtle top highlight, `--elev-panel` shadow. The primary grouping primitive — don't nest panels.
- **Eyebrow** (`.signal-eyebrow`): display font, uppercase, 0.2em tracking, accent color; pair with a short accent tick, not a heading restatement.
- **Button** (`Button` / `buttonClasses` in `page-header.tsx`, backed by `theme.ts`): the canonical button. Variants `primary` (solid `--accent`, `--on-accent` text), `priority` (solid `--priority-solid` red, `--on-priority` text — both AA ≥4.5:1), `ghost` (inset + hairline border). Sizes `md` (44px touch target) / `sm`. Use `<Button>` for buttons, `buttonClasses({variant})` on a `<Link>`. Never hand-roll button classes or wash a CTA into a faint tint.
- **DataTable** (`data-table.tsx`): config-driven table (columns with custom `cell` renderers, `isSelected`, `minWidth`, `emptyState`). Centralizes thead, row rhythm, hover/selected states, and `scope="col"`. Use for any tabular data.
- **Tabs** (`TabNav` in `tab-nav.tsx`, backed by `control.tab*` in `theme.ts`): the canonical tabbed-section nav — a card grid of `{key,label,detail?,count?,href}` items with one active treatment (accent border + soft fill). Use it for any in-page section switcher; never hand-roll tab class strings.
- **Nav icons** (`nav-icons.tsx`): hand-rolled SVG line icons — 24 viewBox, 1.75 stroke, `currentColor`, rendered at 20px. All iconography follows this style; never raster/PNG icons, no filled or gradient icon styles.
- **Back-link:** detail/record pages pass `backHref`/`backLabel` to `PageHeader` (renders the shared `BackLink`). Don't hand-roll back buttons.
- **Mark chat** (`src/app/mark/`): the operator↔Mark conversational surface. Full-height: thread sidebar + message-row conversation (avatar + label + content, alternating bg — not bubbles) + composer with @-mention popover. CSS-only "thinking" indicator (`motion-safe:animate-pulse`, reduced-motion safe). Reuses `PageHeader`, `Button`, and `theme.*` tokens.
- **On-fill tokens:** `--on-accent` / `--on-priority` are the only correct text colors on solid accent/priority fills (contrast-verified). `--priority-solid` is the button-fill red; `--priority` stays for tints/dots/text.
- **Status Pills** (`StatusPill`, backed by `ThemeTone` in `theme.ts`): tinted bg + matching border + colored dot, bright readable text. Tones: amber/green/red/gray/blue/dark.
- **Inputs:** label above, helper/error below, inset surface, 44px min touch target.
- **Empty states:** composed and instructive, dashed `--border-strong` on soft surface.

## 5. Layout Principles

Persistent command rail + asymmetric content grids. Avoid repeated equal 3-column rows. Lead each route with the operational task, then supporting guidance, queues, and next actions. Constrain explanatory copy to ~65–74ch.

## 6. Motion & Interaction

CSS-only transform/opacity. Stagger modules on load (`.module-rise` + `animation-delay`). At most one live status indicator per view may breathe (`.status-breathe`). Hover feedback is a background/border step (the surface tiers exist for this); press feedback is `active:translate-y-px`. No hover levitation (`hover:-translate-y-*`), no glow `box-shadow` on hover or selected states. No animating layout dimensions, no bounce/elastic easing. Respect `prefers-reduced-motion`.

## 7. Typographic Weight Discipline

Reserve 700 (bold) for page titles and hero metrics only. UI labels, pills, table headers, and uppercase microlabels stay at 500–600. Never use 800/900 (`font-extrabold`/`font-black`) — heavy weights at small sizes read loud, not authoritative. Inputs and back-links are 500.

## 8. Anti-Patterns

No emojis, no pure black, no purple/neon AI palette, no gradient text, no side-stripe (`border-left`/`right` > 1px) accent borders on cards/lists/callouts, no nested cards, no equal 3-column dashboard rows, no fake round metrics or placeholder names, no glassmorphism-everywhere, no developer jargon in primary UI. No raster/clip-art iconography (SVG line icons in `currentColor` only). No decorative background imagery behind page headers or panels. No neon glow shadows, no pulsing/radar/ripple ambience. No multi-hue gradient strips as decoration.
