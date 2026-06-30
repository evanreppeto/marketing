# Arc UI redesign — gallery mockups

Faithful **static HTML** prototypes of the Arc app redesign, built gallery-first
before porting into the real Next.js app.

> ⚠️ These are design prototypes only. They are **not** part of the Next build and
> are **not served in production** (they live here, outside `public/` and `src/`).

## Run locally

```bash
node mockups/arc-ui/server.mjs
# opens on the Home command center → http://localhost:8910/
# gallery index (one card per screen) → http://localhost:8910/builds.html
```

In Claude Code you can also start the **"gallery"** config from `.claude/launch.json`.

## Shared runtime (loaded on every screen)

Two small files make the static pages behave like one app:

- `gallery-nav.js` — wires the sidebar nav so each item links to its screen,
  prefetches on hover, marks the active item (`aria-current`), mirrors icon
  `title`s into `aria-label`, and routes the logo Home.
- `gallery-fix.css` — responsive layout (rails stack / rows wrap below ~1080px
  so nothing overflows its box), cross-document view-transition fades, a
  universal keyboard focus ring, and shell normalization.

## Where to start

- `/` — opens directly on the Home command center.
- `builds.html` — the gallery index, one card per screen (`index.html` is the
  original product-thesis landing page).
- `build-arc.html` — the Arc chat (most recently iterated: production-matched
  composer, dot-ring streaming loader, package tray + expand-to-canvas, the
  Skills/Connections dock + modals, single-line thread rail).
- `build-arc-empty.html` — the Arc chat zero-state.
- `build-*.html` — one file per screen (home, CRM, brand, settings, onboarding…).
- `brand/` — Arc logo assets (`arc-mark.png`, `arc-wordmark.png`) used across the mockups.

## Design rules (kept consistent across screens)

- Warm obsidian `#16161a` canvas, antique gold `#c8a24a` accent used **sparingly**
  (rationed to commit actions), Fraunces serif moments + Geist.
- Every element maps to a real backend capability (no fake/unwireable features);
  the design↔wiring honesty map lives in `docs/superpowers/arc-redesign-wiring-map.md`.
- Arc **drafts** for human approval — nothing goes outbound without it.

## Verifying changes

The preview tab renders hidden, so entrance animations are gated behind a `body.mo`
class (added only when visible) and `preview_screenshot` times out on the looping
loaders — verify with DOM/computed-style measurement instead of screenshots.
