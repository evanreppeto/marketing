# Arc Chat — ChatGPT/Claude-class feel

**Date:** 2026-06-23
**Goal:** Make the Arc chat surface (`src/app/arc/`) feel like a real, premium AI chat (ChatGPT / Claude) instead of "low quality." Adopt the standard conventions that define that feel; keep a subtle Arc tint (faint gold on links/caret; the Arc orb only in thinking + empty states). No proprietary asset/branding cloning.

**Posture:** Presentation-only. Approval-safe — no new outbound behavior. Follows `DESIGN.md` (Command Charcoal / antique gold / Fraunces). Preserves the existing streaming engine (polling + typewriter reveal) — this is a rendering/layout/scale pass, not a rewrite.

## Why prod feels low-quality (root causes)

1. **Text sprawls edge-to-edge.** Both `MessageList` and `Composer` live in `max-w-[92rem]` (~1470px). Arc's body has no reading-width cap, so replies run the full monitor width. Single biggest "undesigned" tell.
2. **Step trace doesn't survive scale.** The completed-step breadcrumb (`ThinkingLine`, message-list.tsx ~315) was built for ~5 steps. At 46 leads it becomes a stress-wall of "Creating lead for X → Y → Z …".
3. **Mashed text.** Run-on seams like `parallel.Excellent!` (worker concatenates preamble + result with no break) render as one undifferentiated block.
4. **Small type.** Body is 14px (`text-sm`); ChatGPT/Claude read at ~16px with airy line-height.
5. **Per-message avatar + text action buttons** add chrome that neither reference shows.

## Target design

### Reading column
- One centered column, `max-w-[48rem]` (768px), applied consistently to: operator messages, Arc replies, and the composer. Cards/decks/media stay within the column.
- Generous vertical rhythm between turns (role change ≈ `mt-7`/28px; same-role compact ≈ `mt-3`).

### Arc (assistant) messages
- **Remove the per-message 42px `ArcAvatar`.** Replies render as plain text, full column width, no name label. (Orb survives only in the in-flight thinking state and the empty/hero state — the "subtle Arc tint.")
- Body type: **16px, line-height ~1.75**, `--text-primary`. Paragraph spacing ~12px. Headings/lists/tables refined to match.
- Links/caret keep a faint gold (`--accent`) — the only color in an otherwise neutral thread.

### Operator messages
- Keep right-aligned rounded bubble in `--surface-panel`, now inside the 48rem column. Type bumped to 15–16px to match.

### Thinking / steps (the big calm win)
- **Collapse consecutive same-kind steps into a rolling counter.** While running: one line — `‹glyph› Creating leads · 26` (verb from the group, count of items, latest item subtly shown). When done: `Created 46 leads · 2m14s · Show steps`.
- A single calm in-flight line; the full per-item spine + reasoning + tool traces live behind **Show steps** (unchanged mechanics, fed collapsed data).
- Finished message: one-line summary that expands to the existing `ChainOfThought`.

### Streaming
- Keep the typewriter reveal; tune the caret to a subtle gold block and verify the bottom-fade mask + auto-scroll stay buttery (existing scroll logic is sound — light touch only).

### Action row
- Replace text "Copy / Regenerate" with **icon-only** buttons (copy, 👍/👎, regenerate, save), monochrome, revealed on hover, inside the column.

### Composer
- Narrow wrapper from `max-w-[92rem]` to `max-w-[48rem]` so it aligns under the column; keep its roomy rounded treatment.

## Pure logic (unit-tested in `src/domain`, TDD)

1. `src/domain/arc-step-summary.ts` — `summarizeSteps(steps: ArcStep[]): StepSummary`
   - Groups *consecutive* steps sharing the same `kind` (via `stepGlyphKind`) into runs.
   - Each run yields `{ kind, verb, count, latestLabel, status }`. A run of 1 stays a normal step.
   - Exposes a one-line headline for the current/last run (running vs done) and a total done-count.
   - Deterministic, no I/O. Re-exported from `@/domain`.

2. `src/domain/arc-message-format.ts` — `normalizeArcBody(text: string): string`
   - Conservatively repairs run-on seams: a sentence-ender (`.`/`!`/`?`) immediately followed by an uppercase letter with **no** space → insert a paragraph break.
   - Never touches fenced code blocks, inline code, URLs, decimals (`3.14`), or abbreviations mid-token. Idempotent.
   - Unit-tested against the `parallel.Excellent!` case and false-positive guards.

## Files touched

- `src/domain/arc-step-summary.ts` (new) + `__tests__/arc-step-summary.test.ts`
- `src/domain/arc-message-format.ts` (new) + `__tests__/arc-message-format.test.ts`
- `src/domain/index.ts` — re-export both
- `src/app/arc/_components/message-list.tsx` — column width, remove avatar, type scale, collapsed steps, summary line, icon action row, `normalizeArcBody` in `ArcBody`
- `src/app/arc/_components/composer.tsx` — wrapper `max-w-[48rem]`
- `src/app/globals.css` — caret/spacing tweaks (only if needed)

## Out of scope

- Composer internals (mentions, slash, voice) beyond width.
- Backend/worker streaming (the true fix for the seam) — UI is made robust instead.
- Higgsfield / outbound / any approval-gated behavior.

## Verification

- `pnpm test src/domain/__tests__/arc-step-summary.test.ts` + `arc-message-format.test.ts` green.
- `pnpm build` (tsc) clean — typed step/enum unions.
- `eslint` clean on changed files only.
- Preview the `/arc` thread: confirm narrow column, collapsed steps, clean paragraphs, no avatar, 16px body. (Use `preview_eval` DOM/computed-style checks — screenshots hang on the particle canvas.)
