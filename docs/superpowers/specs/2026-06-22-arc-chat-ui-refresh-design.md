# Arc Chat UI Refresh — Design

**Date:** 2026-06-22
**Status:** Approved for planning
**Scope:** Three surfaces of the Arc chat — the thinking process, the composer, and the model selector. No backend behavior changes; one small additive schema field. Approval-gating and the `fast | standard` route contract are untouched.

## North star

**Premium + editorial restraint.** Calm, confident, ChatGPT/Claude-grade smoothness with a distinctive editorial signature: hairlines over card-soup, the gold accent used sparingly, and the existing editorial serif (`var(--font-serif)`) as the one recurring type moment. This keeps Arc under `DESIGN.md`'s calm rules — the louder, more expressive register stays reserved for `/mark`.

Decisions below were validated against live mockups during brainstorming.

---

## 1. Thinking process

**Files:** `src/app/arc/_components/message-list.tsx` (`PendingBlock` ~267–346, `ThinkingTrace` ~212–252, `ArcReasoning` ~256–265, `ToolTraces`, `useTypewriter`), `src/app/globals.css` (animations), `src/lib/arc-chat/persistence.ts` (`ArcStep`).

### Problem
While Arc works, up to four surfaces stack: the step spine, a collapsible reasoning block, tool traces, and the streaming body — plus a generic sweep-bar fallback. It reads busy, and you can't tell *what kind* of work is happening.

### Decision — "calm evolving line" hybrid
Collapse the in-flight state to a single quiet status line, with the detailed spine available on demand. Specifically, while `status === "pending"`:

- **One status line:** `[work-type glyph] · <serif verb> <plain continuation> · <elapsed>`.
  - The **verb is set in the editorial serif** (`var(--font-serif)`, italic) — e.g. *Searching*, *Matching*, *Drafting*, *Composing*. This is the signature moment.
  - The **work-type glyph** reflects the current step's kind (search / match / draft / media / think / tool). It replaces the bare pulsing dot.
- **Breadcrumb trail:** a single quiet row of completed phase tags (`Searched CRM → Matched persona → Drafting`) so the path is legible without the full vertical spine. Tags use existing muted/hairline tokens — no new color.
- **Streaming body** stays exactly as today: `useTypewriter` reveal + writing caret (`arc-caret`). Keep this; it already reads well.
- **Trace on demand:** a `Show steps` affordance expands the full step list (the current `ThinkingTrace`/`StepTrace` content, now each row carrying its work-type glyph). Reasoning (`ArcReasoning`) and tool traces (`ToolTraces`) move **inside** this expander rather than always-on blocks. Collapsed by default.
- **Fallback (no steps yet):** the same one-line treatment — serif *"Thinking…"* + glyph + a single hairline shimmer. Retire the generic `arc-progress` sweep bar; the calm line carries the wait.
- **Stop / Retry / elapsed / stalled-after-90s** logic is preserved verbatim — only its container changes.

### Work-type glyph — schema
`ArcStep` is currently `{ label; status; at; detail? }`. Add an **optional** field:

```ts
export type ArcStepKind = "search" | "match" | "draft" | "media" | "think" | "tool";
export type ArcStep = { label: string; status: "running" | "done"; at: string; detail?: string[]; kind?: ArcStepKind };
```

- `parseSteps` in `persistence.ts` parses `kind` when present, ignores it otherwise (back-compatible — old rows and the current runner keep working).
- **Client-side fallback:** a pure helper `stepGlyphKind(step): ArcStepKind` infers the kind from `step.kind ?? keyword-match on step.label` (e.g. /search|pull|query|review/ → search, /draft|write|outreach/ → draft, /image|video|render|media/ → media, /match|persona|score/ → match, /tool|call/ → tool, else think). Lives in `domain/` (pure, unit-tested). This makes the glyph work **before** the runner ever populates `kind`, degrading gracefully.
- The runner can later set `kind` explicitly for accuracy; not required for this change.

### Component shape
- New `ThinkingLine` component (the one-line + breadcrumb + expander) replaces the always-stacked layout inside `PendingBlock`. `ThinkingTrace` is retained but rendered only inside the expander, augmented with glyphs. No change to `Message`'s completed-state rendering except that the post-completion `StepTrace`/reasoning collapsibles also gain glyphs for consistency.
- Glyph set: small inline SVGs (magnifier, four-point spark, pen, image, etc.), `var(--mut)` default / `var(--accent)` on the active step — matching existing icon conventions.

---

## 2. Composer

**Files:** `src/app/arc/_components/composer.tsx` (in-box control row ~832–916; below-box context row ~926–976), `model-select.tsx`, the mode `PillSelect`, the project menu.

### Problem
Controls split across two rows: an in-box row (attach / Tools / voice / send) and a separate below-box row (model / mode / project). Two rows of chrome crowd the input.

### Decision — one inline control row
Fold both rows into a **single control line inside the box**, left-to-right:

`[ + ]  |  [✦ Studio ▾]  [Act ▾]  [Project ▾]  ……grow……  [🎙]  [↑ send]`

- **`+` menu (left):** merges today's Attach-image and Tools buttons into one menu (Attach image / Tools & commands / …). The `/` slash trigger and `@` mention autocomplete in the textarea are **unchanged** — Tools is just also reachable from `+`.
- **Context chips (left-center):** `ModelSelect`, the mode `PillSelect`, and the project menu render inline as quiet chips on this row (not below the box). Same components, same popovers, same state — relocated. The model chip leads with the spark glyph + serif tier name (see §3).
- **Voice + Send (right):** voice toggle then the gold send button anchor the right; Stop replaces Send while a reply is pending (existing logic).
- A thin top hairline separates the textarea from the control row (as today).

### Notes
- No change to draft persistence, optimistic send, voice, paste-to-attach, autocomplete, or keyboard handling — purely a layout consolidation of existing controls.
- The error / voice-error lines move with the box; the standalone below-box context `div` (926–976) is removed once its children are relocated into the in-box row.
- Verify wrapping at narrow widths (xl-down, mobile overlay): chips should wrap gracefully above the send anchor rather than overflow.

---

## 3. Model selector

**File:** `src/app/arc/_components/model-select.tsx`.

### Problem
A binary choice (`fast | standard`) presented with dual speed/depth meters — busier than the decision warrants — and a quiet trigger chip that doesn't signal it's switchable. It under-helps at the moment of choosing.

### Decision — editorial two-card with "when to pick"
- **Drop the `Meter` component** and the `speed`/`depth` numeric fields.
- Restructure `MODEL_OPTIONS` to carry guidance instead:

```ts
type ModelOption = {
  id: ArcRoute;            // "standard" | "fast" — unchanged contract
  name: string;           // "Arc Studio" / "Arc Swift"
  short: string;          // "Studio" / "Swift"
  when: string;           // plain-language "pick this when…"
  signal: string;         // one honest trade, incl. wait: "Deeper · top-tier media · takes a beat"
};
```

  - Studio — *when:* "For work that ships — campaign packages, hero media, anything needing Arc's best reasoning." *signal:* "Deeper · top-tier media · takes a beat."
  - Swift — *when:* "For quick passes — brainstorming, edits, fast iterations." *signal:* "Near-instant · fast media."
- **Each menu row:** a kind-glyph (Studio = spark/star, Swift = bolt) + **serif tier name** (`var(--font-serif)` italic on the "Studio"/"Swift" word) + the `when` line + one `signal` chip + a checkmark on the active tier. Active row uses `--accent-soft` (as today).
- **Trigger chip:** `✦ Arc · <serif tier> ▾` — same compact footprint, but the serif name + leading spark make it read as a confident, switchable control.
- **Footer cue retained verbatim:** "Outbound stays locked — Arc drafts, you approve." (on-brand trust signal, keep it).
- Outside-click / Escape / `role="menuitemradio"` a11y behavior unchanged.

---

## Editorial serif note
`--font-serif` resolves to `var(--ff-serif), "Fraunces", Georgia, …` and is already the editorial signature across page headers, the Arc work-canvas heading, and brain panels. Reuse it via the existing `font-serif` class / `var(--font-serif)` so these new serif moments match the rest of the app — no new font wiring. (`layout.tsx` currently points `--ff-serif` at the display family; whatever `font-serif` renders today is the established signature, so we stay consistent by definition.)

## Non-goals
- No changes to message bubbles, the empty state, the Studio side-panel, polling, or the campaign deck.
- No backend/runner changes required (the `ArcStep.kind` field is additive and optional; the glyph works without it).
- No change to routes, approval gating, or the `fast | standard` contract.

## Testing
- **Domain unit tests** (`src/domain/__tests__/`) for `stepGlyphKind` — keyword inference + explicit-`kind` passthrough, covering each `ArcStepKind`.
- **`parseSteps`** test: a step with `kind` round-trips; a step without it still parses (back-compat).
- **Manual / preview verification:** pending → streaming → complete transition reads calm; `Show steps` expands reasoning + tools + glyphed spine; composer one-row layout wraps cleanly at mobile width; model menu reflects active tier and switches per message.
- `pnpm lint` (scoped to changed files) + `pnpm build`/`tsc` for the typed-enum changes.

## Rollout
Single branch, single PR. Visual-only + one additive type — no migration, no env, no flag.
