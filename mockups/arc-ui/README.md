# Arc UI redesign — gallery mockups

Faithful **static HTML** prototypes of the Arc app redesign, built gallery-first
before porting into the real Next.js app.

> ⚠️ These are design prototypes only. They are **not** part of the Next build and
> are **not served in production** (they live here, outside `public/` and `src/`).

## Run locally

```bash
node mockups/arc-ui/server.mjs
# then open http://localhost:8910/  (or /builds.html for the index)
```

In Claude Code you can also start the **"gallery"** config from `.claude/launch.json`.

## Where to start

- `builds.html` (also `index.html`) — the gallery index, one card per screen.
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
