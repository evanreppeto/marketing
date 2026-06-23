# Arc Chat UI Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh three Arc chat surfaces — the thinking process, the composer, and the model selector — toward "premium + editorial restraint" without changing any backend behavior.

**Architecture:** Pure-domain helper (`stepGlyphKind`) classifies each thinking step into a work-type, surfaced as a glyph. The pending UI collapses to one calm serif-verb line + breadcrumb with the full trace behind a `Show steps` expander. The composer folds its two control rows into one. The model menu drops meters for plain-language "when to pick" guidance. One additive optional field (`ArcStep.kind`); everything degrades gracefully without it.

**Tech Stack:** Next.js 16 / React 19, Tailwind + CSS variables (Signal tokens), Vitest. Editorial serif via existing `var(--font-serif)`.

---

## File Structure

- `src/domain/arc-step-kind.ts` — **new.** `ArcStepKind` type + pure `stepGlyphKind()` classifier. Re-exported via `src/domain/index.ts`.
- `src/domain/__tests__/arc-step-kind.test.ts` — **new.** Unit tests for the classifier.
- `src/lib/arc-chat/persistence.ts` — **modify.** Add optional `kind` to `ArcStep`; parse it in `parseSteps`.
- `src/app/arc/_components/work-glyph.tsx` — **new.** `<WorkGlyph kind>` — one inline SVG per work-type.
- `src/app/arc/_components/message-list.tsx` — **modify.** New `ThinkingLine`; rewrite `PendingBlock` layout; add glyphs to `ThinkingTrace`.
- `src/app/globals.css` — **modify (small).** Nothing required to add; the `.arc-progress` rule simply stops being used (leave it in place — it is harmless and may be reused).
- `src/app/arc/_components/composer.tsx` — **modify.** Fold the in-box control row + below-box context row into one row; merge Attach + Tools into a `+` menu.
- `src/app/arc/_components/model-select.tsx` — **modify.** Replace meters with `when`/`signal` guidance + serif tier names.

Build in this order: domain → persistence → glyph → thinking → model → composer → verify. Each task ends in a commit.

---

## Task 1: `ArcStepKind` + `stepGlyphKind` classifier (domain, TDD)

**Files:**
- Create: `src/domain/arc-step-kind.ts`
- Test: `src/domain/__tests__/arc-step-kind.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/arc-step-kind.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { stepGlyphKind } from "@/domain";

describe("stepGlyphKind", () => {
  it("returns an explicit kind verbatim when present", () => {
    expect(stepGlyphKind({ label: "anything at all", kind: "media" })).toBe("media");
  });

  it("classifies search-like labels", () => {
    expect(stepGlyphKind({ label: "Pulled 3 inactive accounts" })).toBe("search");
    expect(stepGlyphKind({ label: "Searched CRM for lapsed leads" })).toBe("search");
    expect(stepGlyphKind({ label: "Reviewing the pipeline" })).toBe("search");
  });

  it("classifies match-like labels", () => {
    expect(stepGlyphKind({ label: "Matched persona — Homeowner (0.86)" })).toBe("match");
    expect(stepGlyphKind({ label: "Scored the opportunity" })).toBe("match");
  });

  it("classifies draft-like labels", () => {
    expect(stepGlyphKind({ label: "Drafting outreach angle" })).toBe("draft");
    expect(stepGlyphKind({ label: "Wrote the email copy" })).toBe("draft");
  });

  it("classifies media-like labels", () => {
    expect(stepGlyphKind({ label: "Rendering a 4:5 image" })).toBe("media");
    expect(stepGlyphKind({ label: "Upscaling the hero video" })).toBe("media");
  });

  it("classifies tool-like labels", () => {
    expect(stepGlyphKind({ label: "Calling crm.query tool" })).toBe("tool");
  });

  it("falls back to think for unclassifiable labels", () => {
    expect(stepGlyphKind({ label: "Considering the options" })).toBe("think");
    expect(stepGlyphKind({ label: "" })).toBe("think");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/arc-step-kind.test.ts`
Expected: FAIL — `stepGlyphKind` is not exported from `@/domain`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/arc-step-kind.ts`:

```ts
/**
 * Work-type of a single Arc thinking step, used to pick a glyph in the chat UI.
 * Optional on the wire (`ArcStep.kind`); when absent we infer it from the label
 * so the glyph works before the runner ever populates it.
 */
export type ArcStepKind = "search" | "match" | "draft" | "media" | "think" | "tool";

// Order matters: the first pattern that matches wins. `media` precedes `search`
// so "Reviewing media" reads as media, not the "review" → search rule.
const STEP_KIND_PATTERNS: ReadonlyArray<[ArcStepKind, RegExp]> = [
  ["media", /\b(image|images|video|render|rendering|media|photo|visual|asset|thumbnail|upscal)/i],
  ["search", /\b(search|pull|pulled|query|queried|review|reviewing|scan|scanned|find|found|fetch|gather|look)/i],
  ["match", /\b(match|matched|persona|score|scored|segment|rank|classif|map)/i],
  ["draft", /\b(draft|drafting|write|wrote|writing|outreach|compose|composing|angle|copy|email|sms|headline)/i],
  ["tool", /\b(tool|call|calling|api|execute|executing|invoke|invoking)/i],
];

export function stepGlyphKind(step: { label: string; kind?: ArcStepKind }): ArcStepKind {
  if (step.kind) return step.kind;
  const label = step.label ?? "";
  for (const [kind, re] of STEP_KIND_PATTERNS) {
    if (re.test(label)) return kind;
  }
  return "think";
}
```

- [ ] **Step 4: Re-export from the domain barrel**

In `src/domain/index.ts`, add (alongside the other `export * from` lines):

```ts
export * from "./arc-step-kind";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/arc-step-kind.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Commit**

```bash
git add src/domain/arc-step-kind.ts src/domain/__tests__/arc-step-kind.test.ts src/domain/index.ts
git commit -m "feat(arc): add stepGlyphKind work-type classifier"
```

---

## Task 2: Add optional `kind` to `ArcStep` + parse it

**Files:**
- Modify: `src/lib/arc-chat/persistence.ts:24` (the `ArcStep` type) and `parseSteps` (~118–140)

- [ ] **Step 1: Extend the `ArcStep` type**

At the top of `src/lib/arc-chat/persistence.ts`, add the import (if `@/domain` is not already imported there):

```ts
import type { ArcStepKind } from "@/domain";
```

Change line 24 from:

```ts
export type ArcStep = { label: string; status: "running" | "done"; at: string; detail?: string[] };
```

to:

```ts
export type ArcStep = { label: string; status: "running" | "done"; at: string; detail?: string[]; kind?: ArcStepKind };
```

- [ ] **Step 2: Parse `kind` in `parseSteps`**

Locate the loop in `parseSteps` (~118–140) where each step object is built and pushed. It currently reads `label`, `status`, `at`, and `detail` off `item`. Add a `kind` read using the same defensive pattern, and include it on the pushed object only when valid. Insert this near the other field reads:

```ts
    const VALID_KINDS = ["search", "match", "draft", "media", "think", "tool"];
    const rawKind = (item as { kind?: unknown }).kind;
    const kind = typeof rawKind === "string" && VALID_KINDS.includes(rawKind)
      ? (rawKind as ArcStep["kind"])
      : undefined;
```

Then add `...(kind ? { kind } : {})` to the object pushed into `out` (so absent/invalid `kind` is simply omitted — back-compatible with existing rows).

- [ ] **Step 3: Verify types compile**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from `persistence.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/arc-chat/persistence.ts
git commit -m "feat(arc): parse optional ArcStep.kind (additive, back-compatible)"
```

---

## Task 3: `WorkGlyph` component

**Files:**
- Create: `src/app/arc/_components/work-glyph.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/arc/_components/work-glyph.tsx`:

```tsx
import type { ReactNode } from "react";

import type { ArcStepKind } from "@/domain";

/** One inline glyph per Arc work-type. Stroke uses currentColor so callers set
 *  the tone (muted by default, accent when live). */
const GLYPHS: Record<ArcStepKind, ReactNode> = {
  search: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m17 17-3.5-3.5" />
    </>
  ),
  match: (
    <path d="M10 2.5c.4 3.2 1.4 4.2 4.6 4.6-3.2.4-4.2 1.4-4.6 4.6-.4-3.2-1.4-4.2-4.6-4.6 3.2-.4 4.2-1.4 4.6-4.6Z" />
  ),
  draft: (
    <>
      <path d="M4 16l1-4 8-8 3 3-8 8z" />
      <path d="M12.5 5.5l2 2" />
    </>
  ),
  media: (
    <>
      <rect x="3" y="4.5" width="14" height="11" rx="2" />
      <circle cx="7.5" cy="8.5" r="1.4" />
      <path d="M4 13.5l4-3.5 3 2.5 2-2 4 3.5" />
    </>
  ),
  tool: (
    <>
      <path d="M14 7H4" />
      <path d="M16 13H6" />
      <circle cx="16" cy="7" r="2.3" />
      <circle cx="8" cy="13" r="2.3" />
    </>
  ),
  think: <circle cx="10" cy="10" r="2.6" />,
};

export function WorkGlyph({ kind, className }: { kind: ArcStepKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[kind]}
    </svg>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/arc/_components/work-glyph.tsx
git commit -m "feat(arc): add WorkGlyph component"
```

---

## Task 4: Calm thinking line + expander (rewrite `PendingBlock`)

**Files:**
- Modify: `src/app/arc/_components/message-list.tsx` — add imports, add `firstWordSplit`/`shortLabel`/`ThinkingLine`, rewrite `PendingBlock` (~267–346), augment `ThinkingTrace` (~212–252).

- [ ] **Step 1: Add imports**

At the top of `message-list.tsx`, extend the existing `@/domain` usage (add an import if none exists) and import the glyph:

```ts
import { stepGlyphKind } from "@/domain";
import { WorkGlyph } from "./work-glyph";
```

- [ ] **Step 2: Add the small label helpers (above `ThinkingTrace`)**

```tsx
/** Split a step label into [firstWord, rest] so the verb can carry the serif. */
function firstWordSplit(label: string): [string, string] {
  const trimmed = label.trim();
  const i = trimmed.indexOf(" ");
  if (i === -1) return [trimmed, ""];
  return [trimmed.slice(0, i), trimmed.slice(i)];
}

/** Compact a completed-step label for the breadcrumb (keeps it to one line). */
function shortLabel(label: string): string {
  const head = label.split(" — ")[0].split(", ")[0].trim();
  return head.length > 28 ? `${head.slice(0, 27)}…` : head;
}
```

- [ ] **Step 3: Augment `ThinkingTrace` to show work glyphs**

Replace the dot/check block inside `ThinkingTrace` (the `{done ? (...check...) : (<span className="arc-tstep-dot">...)}` at ~222–230) with a glyph-bearing version:

```tsx
              {done ? (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)]">
                  <WorkGlyph kind={stepGlyphKind(s)} className="h-3 w-3 text-[var(--accent)]" />
                </span>
              ) : (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--accent)]">
                  <WorkGlyph kind={stepGlyphKind(s)} className="h-3 w-3 text-[var(--accent)]" />
                </span>
              )}
```

(The connecting `<span className="...w-px...">` line below it stays; adjust nothing else in `ThinkingTrace`.)

- [ ] **Step 4: Add the `ThinkingLine` component (above `PendingBlock`)**

```tsx
/**
 * Calm in-flight status: one line carrying a work glyph + serif verb for the
 * current step, a quiet breadcrumb of completed phases, and a Show/Hide steps
 * toggle. The full spine + reasoning + tools live behind the toggle.
 */
function ThinkingLine({
  steps,
  expanded,
  onToggle,
}: {
  steps: ArcStep[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const current = steps[steps.length - 1];
  const done = steps.filter((s) => s.status === "done");
  const [verb, rest] = firstWordSplit(current.label);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)]">
          <WorkGlyph kind={stepGlyphKind(current)} className="h-3.5 w-3.5 text-[var(--accent)]" />
        </span>
        <span className="min-w-0 flex-1 text-sm leading-5">
          <span style={{ fontFamily: "var(--font-serif)" }} className="italic text-[var(--text-secondary)]">
            {verb}
          </span>
          {rest ? <span className="arc-shimmer font-medium">{rest}</span> : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-[2.125rem] text-[11px] text-[var(--text-muted)]">
        {done.map((s, i) => (
          <span key={`${i}-${s.label}`} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden className="opacity-40">→</span> : null}
            <span>{shortLabel(s.label)}</span>
          </span>
        ))}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="ml-1 rounded-md border border-[var(--border-hairline)] px-1.5 py-0.5 font-medium transition hover:text-[var(--text-primary)]"
        >
          {expanded ? "Hide steps" : "Show steps"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `PendingBlock`'s body**

Replace the `return (...)` of `PendingBlock` (the JSX from `~295` to `~344`) with:

```tsx
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      {hasSteps ? (
        <>
          <ThinkingLine steps={steps} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
          {expanded ? (
            <div className="border-l border-[var(--border-hairline)] pl-3.5">
              <ThinkingTrace steps={steps} assistantName={assistantName} />
              {reasoning ? <ArcReasoning text={reasoning} streaming /> : null}
              {toolCalls.length > 0 ? <ToolTraces tools={toolCalls} /> : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {reasoning ? <ArcReasoning text={reasoning} streaming /> : null}
          {toolCalls.length > 0 ? <ToolTraces tools={toolCalls} /> : null}
        </>
      )}

      {hasBody ? (
        <div aria-label={`${assistantName} is writing`} className="arc-streaming">
          <ArcBody body={typed} />
          <span aria-hidden className="arc-caret" />
        </div>
      ) : !hasSteps ? (
        <div className="flex items-center gap-2.5" role="status" aria-live="polite" aria-label={`${assistantName} is thinking`}>
          <span className="arc-tstep-dot"><span className="core" /></span>
          <span className="text-sm leading-5">
            <span style={{ fontFamily: "var(--font-serif)" }} className="italic text-[var(--text-secondary)]">Thinking</span>
            <span className="arc-shimmer font-medium">…</span>
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span className="tabular-nums">{elapsed}</span>
        <button
          type="button"
          onClick={onStop}
          className="rounded-md border border-[var(--border-hairline)] px-2 py-0.5 font-semibold transition hover:border-[var(--priority-bright)] hover:text-[var(--priority-bright)]"
        >
          Stop
        </button>
        {stalled ? (
          <>
            <span className="text-[var(--text-muted)]">· taking longer than usual</span>
            <button
              type="button"
              onClick={() => {
                onStop();
                onRetry();
              }}
              className="rounded-md border border-[var(--border-hairline)] px-2 py-0.5 font-semibold text-[var(--accent-contrast)] transition hover:border-[var(--accent)]"
            >
              Retry
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
```

Note: `useState` is already imported at the top of the file (line 3). The `const [expanded, ...]` line goes immediately before `return`, replacing nothing else in the function's preamble (the `useElapsed`/`useTypewriter`/`useStalled`/`hasSteps`/`hasBody` lines stay as-is).

- [ ] **Step 6: Verify compile + lint the file**

Run: `pnpm exec tsc --noEmit`
Run: `pnpm exec eslint src/app/arc/_components/message-list.tsx src/app/arc/_components/work-glyph.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/arc/_components/message-list.tsx
git commit -m "feat(arc): calm thinking line with work glyphs + steps-on-demand"
```

---

## Task 5: Model selector — editorial two-card

**Files:**
- Modify: `src/app/arc/_components/model-select.tsx`

- [ ] **Step 1: Replace the option model + drop the `Meter` component**

Replace the `ModelOption` type and `MODEL_OPTIONS` (lines ~19–48) with:

```ts
type ModelOption = {
  id: ArcRoute;
  /** Full name shown in the menu, e.g. "Arc Studio". */
  name: string;
  /** Compact label shown on the trigger chip, e.g. "Studio". */
  short: string;
  /** Plain-language "pick this when…" guidance. */
  when: string;
  /** One honest trade, wait-time included. */
  signal: string;
};

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "standard",
    name: "Arc Studio",
    short: "Studio",
    when: "For work that ships — campaign packages, hero media, anything needing Arc's best reasoning.",
    signal: "Deeper · top-tier media · takes a beat",
  },
  {
    id: "fast",
    name: "Arc Swift",
    short: "Swift",
    when: "For quick passes — brainstorming, edits, fast iterations where you want an answer now.",
    signal: "Near-instant · fast media",
  },
];
```

Delete the entire `Meter` function (~60–78). Keep `SparkGlyph`.

- [ ] **Step 2: Add a per-tier glyph helper (below `SparkGlyph`)**

```tsx
/** Studio = spark (its own mark); Swift = a bolt. */
function TierGlyph({ id, className }: { id: ArcRoute; className?: string }) {
  if (id === "fast") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2 4 11h5l-1 7 7-9h-5z" />
      </svg>
    );
  }
  return <SparkGlyph className={className} />;
}
```

- [ ] **Step 3: Serif tier name on the trigger chip**

In the trigger button (~123–129), replace the `<span className="text-[var(--text-muted)]">· {current.short}</span>` with a serif tier name:

```tsx
        <span className="text-[var(--text-muted)]">·</span>
        <span style={{ fontFamily: "var(--font-serif)" }} className="italic text-[var(--text-primary)]">{current.short}</span>
```

- [ ] **Step 4: Rewrite each menu row (replace the `MODEL_OPTIONS.map` body, ~146–182)**

```tsx
            {MODEL_OPTIONS.map((o) => {
              const active = o.id === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition",
                    active ? "bg-[var(--accent-soft)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]" : "hover:bg-[var(--surface-inset)]",
                  )}
                >
                  <span className={cx(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    active ? "bg-[rgba(216,162,74,0.22)]" : "border border-[var(--border-hairline)] bg-[var(--surface-inset)]",
                  )}>
                    <TierGlyph id={o.id} className={cx("h-4 w-4", active ? "text-[var(--accent)]" : "text-[var(--text-secondary)]")} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cx("text-sm font-semibold", active ? "text-[var(--accent-contrast)]" : "text-[var(--text-primary)]")}>
                        Arc <span style={{ fontFamily: "var(--font-serif)" }} className="italic font-medium">{o.short}</span>
                      </span>
                      {active ? (
                        <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 10.5l3.5 3.5L16 5.5" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="text-[11px] leading-snug text-[var(--text-muted)]">{o.when}</span>
                    <span className="mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                      <span aria-hidden className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                      {o.signal}
                    </span>
                  </span>
                </button>
              );
            })}
```

(The header at ~137–143 and the locked-outbound footer at ~185–191 stay unchanged.)

- [ ] **Step 5: Verify compile + lint**

Run: `pnpm exec tsc --noEmit`
Run: `pnpm exec eslint src/app/arc/_components/model-select.tsx`
Expected: no errors. (If `ArcRoute` is now the only thing used from the import, that's fine — it already was imported.)

- [ ] **Step 6: Commit**

```bash
git add src/app/arc/_components/model-select.tsx
git commit -m "feat(arc): editorial model selector with when-to-pick guidance"
```

---

## Task 6: Composer — one control row

**Files:**
- Modify: `src/app/arc/_components/composer.tsx` — add a `+` menu (state + dropdown), merge the in-box control row (~832–916) with the below-box context row (~926–976) into a single row, and delete the now-empty below-box `div`.

- [ ] **Step 1: Add `plusMenuOpen` state + outside-click handling**

Find where the other composer menu state is declared (near `projectMenuOpen`/`setProjectMenuOpen`). Add:

```tsx
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const plusWrapRef = useRef<HTMLDivElement>(null);
```

Find the existing `useEffect` that closes `projectMenuOpen` on outside mousedown (it uses `projectWrapRef`). Add a sibling effect right after it:

```tsx
  useEffect(() => {
    if (!plusMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (plusWrapRef.current && !plusWrapRef.current.contains(e.target as Node)) setPlusMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [plusMenuOpen]);
```

- [ ] **Step 2: Replace the in-box control row (the `<div className="flex items-center justify-between gap-2 border-t ...">` block at ~832–916)**

Replace that entire block with the consolidated single row below. It keeps the same outer `justify-between` shell, moves model/mode/project into the left group, and swaps the separate Attach + Tools buttons for one `+` menu:

```tsx
          <div className="flex items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <div ref={plusWrapRef} className="relative">
                <button
                  type="button"
                  onClick={() => setPlusMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={plusMenuOpen}
                  aria-label="Add attachment or run a tool"
                  title="Attach or run a tool"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
                >
                  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 5v10M5 10h10" />
                  </svg>
                </button>
                {plusMenuOpen ? (
                  <div role="menu" className="absolute bottom-full left-0 z-30 mb-1.5 w-44 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      disabled={uploading}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] disabled:opacity-50"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13l5-5 4 4 3-3M4 16h12" /></svg>
                      Attach image
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setSlash((s) => (s && s.length ? null : SLASH_COMMANDS));
                        setActiveIndex(0);
                        textareaRef.current?.focus();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
                      Tools &amp; commands
                    </button>
                  </div>
                ) : null}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />

              <span aria-hidden className="mx-0.5 h-5 w-px bg-[var(--border-hairline)]" />

              <ModelSelect value={route} onChange={onRouteChange} />
              <PillSelect ariaLabel="Mode" value={mode} options={MODE_OPTIONS} onChange={onModeChange} />

              <div ref={projectWrapRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProjectMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={projectMenuOpen}
                  className={cx(
                    "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition",
                    projectMenuOpen
                      ? "bg-[var(--surface-inset)] text-[var(--text-primary)]"
                      : selectedProjectName
                        ? "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3l2 2.5h5a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" />
                  </svg>
                  {selectedProjectName ?? "No project"}
                  <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 8 4 4 4-4" />
                  </svg>
                </button>
                {projectMenuOpen ? (
                  <div role="menu" className="absolute bottom-full left-0 z-20 mb-1.5 max-h-56 w-52 overflow-y-auto rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]">
                    <button type="button" role="menuitem" onClick={() => chooseProject(null)} className={projectItemCls(selectedProjectId === null)}>
                      No project
                    </button>
                    {projects.map((p) => (
                      <button key={p.id} type="button" role="menuitem" onClick={() => chooseProject(p.id)} className={projectItemCls(selectedProjectId === p.id)}>
                        {p.name}
                      </button>
                    ))}
                    {projects.length === 0 ? (
                      <p className="px-2.5 py-2 text-xs text-[var(--text-muted)]">No projects yet. Create one in the sidebar.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={toggleVoiceInput}
                disabled={voiceState === "checking" || voiceState === "unsupported" || isPending}
                aria-label={voiceState === "listening" ? "Stop voice input" : "Start voice input"}
                aria-pressed={voiceState === "listening"}
                title={voiceState === "unsupported" ? "Voice input is not available in this browser" : voiceState === "listening" ? "Stop voice input" : "Speak a message"}
                className={cx(
                  "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95",
                  voiceState === "listening"
                    ? "bg-[var(--accent)] text-[var(--on-accent)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
                  voiceState === "checking" || voiceState === "unsupported" || isPending ? "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-[var(--text-muted)]" : "",
                )}
              >
                <svg viewBox="0 0 20 20" className="h-[1.125rem] w-[1.125rem]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 3.5a2.5 2.5 0 0 0-2.5 2.5v3.5a2.5 2.5 0 0 0 5 0V6A2.5 2.5 0 0 0 10 3.5Z" />
                  <path d="M5.5 9.5a4.5 4.5 0 0 0 9 0" />
                  <path d="M10 14v2.5" />
                  <path d="M7.5 16.5h5" />
                </svg>
              </button>

              {replyPending ? (
                <button
                  type="button"
                  onClick={() => onStopReply?.()}
                  aria-label={`Stop ${assistantName}`}
                  title="Stop"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--priority-bright)] active:scale-95"
                >
                  <span aria-hidden className="h-3 w-3 rounded-[2px] bg-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={disabled}
                  aria-label="Send message"
                  className={cx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition duration-200 ease-out",
                    disabled
                      ? "cursor-not-allowed bg-[var(--surface-raised)] text-[var(--text-muted)]"
                      : "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] active:scale-95",
                  )}
                >
                  {isPending ? <Spinner /> : <SendIcon />}
                </button>
              )}
            </div>
          </div>
```

- [ ] **Step 3: Delete the below-box context row**

Remove the entire below-box context `div` (the `{/* Visible context selectors below the box... */}` comment plus its `<div className="mt-2 flex flex-wrap items-center gap-2 px-1 ...">` containing `ModelSelect`, `PillSelect`, and the project menu — ~926–976), since those three controls now live in the row above. Keep the error/voice-error `<p>` lines (~919–924) where they are.

- [ ] **Step 4: Verify compile + lint**

Run: `pnpm exec tsc --noEmit`
Run: `pnpm exec eslint src/app/arc/_components/composer.tsx`
Expected: no errors. If lint flags an unused var (e.g. a now-unused handler), confirm it is truly unused before removing — all referenced handlers (`fileInputRef`, `setSlash`, `SLASH_COMMANDS`, `setActiveIndex`, `toggleVoiceInput`, `chooseProject`, `projectItemCls`, etc.) are still used by the new row.

- [ ] **Step 5: Commit**

```bash
git add src/app/arc/_components/composer.tsx
git commit -m "feat(arc): consolidate composer to a single control row"
```

---

## Task 7: Verify end to end

- [ ] **Step 1: Full test + type + build**

Run: `pnpm test src/domain/__tests__/arc-step-kind.test.ts`
Run: `pnpm exec tsc --noEmit`
Run: `pnpm build`
Expected: tests pass, no type errors, build succeeds.

- [ ] **Step 2: Preview the Arc chat**

Start the dev server (preview tools) and open `/arc`. Verify:
- Sending a message shows the calm thinking line: a work glyph + serif verb, a breadcrumb of completed phases, and a `Show steps` toggle that expands the full spine + reasoning + tools.
- The streaming reply still types in with the caret; Stop and (after a stall) Retry still work.
- The composer shows a single control row: `+` menu (Attach image / Tools & commands), then Studio / mode / project chips, with voice + send on the right. The `/` slash and `@` mention menus still open from typing.
- The model menu shows two editorial cards with serif names, "when to pick" copy, and a signal chip; switching tiers updates the trigger chip.

- [ ] **Step 3: Responsive check**

Resize to a narrow width (mobile overlay). Confirm the composer control chips wrap above/around the send anchor without overflow, and the thinking breadcrumb wraps cleanly.

- [ ] **Step 4: Final commit (if any preview fixes were needed)**

```bash
git add -A
git commit -m "fix(arc): chat UI refresh preview adjustments"
```

---

## Self-Review notes

- **Spec coverage:** thinking (Tasks 3–4), `ArcStep.kind` + fallback (Tasks 1–2), composer one-row (Task 6), model selector (Task 5), serif signature reused via `var(--font-serif)` (Tasks 4–5), tests (Task 1), verification incl. responsive (Task 7). All spec sections map to a task.
- **Type consistency:** `ArcStepKind` defined in Task 1, imported by persistence (Task 2), consumed by `WorkGlyph` (Task 3) and `stepGlyphKind` callers (Task 4). `ModelOption.when`/`signal` defined and consumed in Task 5. `ThinkingLine` props match its call site in Task 4.
- **Non-goals honored:** no bubble/empty-state/Studio-panel/polling/campaign-deck changes; no migration, route, or approval-gate changes.
