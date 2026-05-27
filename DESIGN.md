# Design System: Big Shoulders Growth Engine

## 1. Visual Theme & Atmosphere

A disciplined restoration-operations command center: charcoal navigation, warm white work surface, precise type, restrained red accents, and dense but readable operating modules. The interface should feel executive and field-aware, not developer-first.

## 2. Color Palette & Roles

- **Command Charcoal** (#111214) - Sidebar, high-contrast actions, primary text depth.
- **Canvas White** (#F7F5F1) - Main app background with a warm, physical paper quality.
- **Surface White** (#FFFFFF) - Product panels and table surfaces.
- **Ink** (#151515) - Primary text.
- **Muted Graphite** (#6E6962) - Supporting text, timestamps, helper copy.
- **Hairline** (#DDD6CD) - Structural borders and dividers.
- **Restoration Red** (#E7352F) - Single accent for active navigation, priority actions, destructive/out-of-scope state.

## 3. Typography Rules

- **Display:** Geist/Satoshi-style sans stack, tight tracking, controlled scale, confident weight.
- **Body:** Same sans stack, relaxed leading, max 65ch for explanatory copy.
- **Mono:** Geist Mono/Cascadia Mono stack for identifiers and operational IDs.
- **Banned:** Inter as an explicit design choice, generic serif fonts, neon gradients, and oversized dashboard headlines.

## 4. Component Stylings

- **Buttons:** 6px radius, clear contrast, tactile active translate, focus-visible ring.
- **Panels:** 6px radius, 1px hairline border, subtle diffusion shadow. Use cards only for meaningful grouped modules.
- **Tables:** Strong row rhythm, selected state, action cells, visible source/context metadata.
- **Status Pills:** Small, readable, plain-language state labels. No decorative filler.
- **Inputs:** Label above, helper/error below, 44px minimum touch target.

## 5. Layout Principles

Use a persistent command rail and asymmetric content grids. Avoid repeated equal 3-column rows. Route pages should lead with the operational task, then expose supporting guidance, queues, and next actions.

## 6. Motion & Interaction

Use CSS-only transform and opacity transitions. Stagger large modules with subtle load-in. Active status indicators may breathe softly. Avoid expensive global animation and avoid animating layout dimensions.

## 7. Anti-Patterns

No emojis, no pure black, no purple/neon AI palette, no generic fake names, no fake round metrics, no stock-photo hero, no floating blobs, no nested card stacks, no developer jargon in primary UI, and no placeholder-looking buttons or tables.
