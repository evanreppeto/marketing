# Arc Chat Hero Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one Arc conversation turn visibly more premium *and* visibly smarter — Arc shows its work (scalable timeline), proves it reasoned from memory (recall chips), lets the operator approve/revise inline (no Studio round-trip), and hands back one-click deep-link cards into the app.

**Architecture:** All four features ride in `arc_messages.metadata` JSON, parsed defensively app-side — **no DB migration.** The runner emits new fields; the app parses + renders them; malformed data is silently dropped. Pure logic lives in `src/domain/` (unit-tested); I/O stays in `src/lib/` and routes; UI in `src/app/arc/_components/`. The runner (`apps/arc-runner/`) gets light additive changes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Supabase (service-role), Tailwind tokens (Signal design system), Claude Agent SDK (runner). Package manager: pnpm 10.33.0.

**Testing philosophy:** Pure functions and server actions are TDD'd (test-first). Presentational React (no component-test harness exists for these files) is verified by extracting logic into tested pure helpers, then typecheck + lint + the preview harness. This is deliberate — we don't stand up a brittle render harness for thin JSX (YAGNI).

**Commands (exact):**
- App unit test (single file): `pnpm test <path/to/file.test.ts>`
- App unit tests (a dir): `pnpm test src/domain`
- App typecheck (authoritative): `pnpm build`
- Scoped lint (avoid the vendored-file noise): `pnpm exec eslint <path>`
- Runner test (single file): `pnpm --filter @bsr/arc-runner exec vitest run <path>`
- Runner full suite (do this when touching runner — tool-surface tests are pinned): `pnpm --filter @bsr/arc-runner test`
- Runner typecheck: `pnpm --filter @bsr/arc-runner typecheck`

**Approval-safety invariant (every task):** No outbound send/publish/launch/spend is ever added. "Comment & revise" and "Approve all clean" only change internal approval state. The "outbound locked" cue stays on every card. Every new/changed server action calls `requireOperator()`.

---

## File Structure

**Created:**
- `src/app/arc/_components/draft-decision-controls.tsx` — client component: inline Approve / Comment-&-revise / Decline for a chat draft card (reuses `decideAssetAction` + `requestRevisionAction`).
- `src/app/arc/_components/recall-chips.tsx` — presentational "Recalled from memory" chip row (wraps `EvidenceChip`).
- `src/app/arc/_components/navigate-card.tsx` — presentational deep-link app-state card.
- `src/domain/__tests__/cap-steps.test.ts`, `src/domain/__tests__/parse-recall.test.ts`, `src/domain/__tests__/recall-relevance.test.ts`, `src/domain/__tests__/clean-approvable.test.ts`, `src/domain/__tests__/parse-navigate-card.test.ts` — domain unit tests.

**Modified:**
- `src/domain/arc-step-summary.ts` — add `capSteps` pure helper.
- `src/domain/brain-recall.ts` — add `recallRelevance`; extend `RecallItem` + `enrichRecall` with confidence/nodeId.
- `src/domain/arc-chat.ts` — add `ArcRecall` + `parseRecall`; extend `ArcActionCard` + `parseActions` with `navigate` kind + `appState`; add `cleanApprovableDrafts`.
- `src/domain/index.ts` — export the new domain symbols.
- `src/lib/knowledge-graph/recall.ts` — pass `message` into `enrichRecall`.
- `src/lib/arc-chat/persistence.ts` — add `recall` to `ArcMessage` + parse it in `toMessage`.
- `src/app/arc/_components/message-list.tsx` — cap the step timeline; render recall chips; route navigate cards.
- `src/app/arc/_components/action-card.tsx` — swap approval footer to `DraftDecisionControls`; lift provenance to header; render navigate cards.
- `src/app/arc/_components/campaign-deck.tsx` — "Approve all clean" deck control.
- `src/app/arc/actions.ts` — add `approveCleanDraftsAction`.
- `apps/arc-runner/src/recall.ts` — extend `RecallItem` (confidence, nodeId).
- `apps/arc-runner/src/arc.ts` — add `memory` to `ArcTurnResult`; return it.
- `apps/arc-runner/src/handler.ts` — attach `metadata.recall`.
- `apps/arc-runner/src/types.ts` — extend `ArcActionCard` (`navigate` + `appState`).
- `apps/arc-runner/src/tools/cards.ts` — `emit_card` accepts `navigate` + `appState`.
- `apps/arc-runner/src/tools/cards.test.ts` — test the navigate kind.

---

## FEATURE 1 — Scalable work timeline

### Task 1: `capSteps` pure helper

**Files:**
- Modify: `src/domain/arc-step-summary.ts`
- Modify: `src/domain/index.ts`
- Test: `src/domain/__tests__/cap-steps.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/cap-steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { capSteps } from "@/domain";

describe("capSteps", () => {
  it("returns all items and hidden:0 when under the cap", () => {
    expect(capSteps([1, 2, 3], 5)).toEqual({ visible: [1, 2, 3], hidden: 0 });
  });

  it("caps to max and reports the hidden count", () => {
    expect(capSteps([1, 2, 3, 4, 5, 6, 7], 5)).toEqual({ visible: [1, 2, 3, 4, 5], hidden: 2 });
  });

  it("treats max <= 0 as no cap", () => {
    expect(capSteps([1, 2, 3], 0)).toEqual({ visible: [1, 2, 3], hidden: 0 });
  });

  it("handles an empty list", () => {
    expect(capSteps([], 5)).toEqual({ visible: [], hidden: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/cap-steps.test.ts`
Expected: FAIL — `capSteps is not exported` / not a function.

- [ ] **Step 3: Implement the helper**

Append to `src/domain/arc-step-summary.ts`:

```ts
/**
 * Cap a list to the first `max` items, reporting how many were hidden, so a long
 * timeline shows "first N + ＋N more" instead of flooding the thread. `max <= 0`
 * means no cap. Pure.
 */
export function capSteps<T>(items: T[], max: number): { visible: T[]; hidden: number } {
  if (max <= 0 || items.length <= max) return { visible: items, hidden: 0 };
  return { visible: items.slice(0, max), hidden: items.length - max };
}
```

Add to `src/domain/index.ts` wherever `arc-step-summary` is re-exported (search for `arc-step-summary`); ensure `capSteps` is exported, e.g. extend the existing line:

```ts
export { summarizeSteps, capSteps } from "./arc-step-summary";
```

(If `arc-step-summary` is re-exported with `export * from "./arc-step-summary"`, no change is needed — verify before editing.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/cap-steps.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/arc-step-summary.ts src/domain/index.ts src/domain/__tests__/cap-steps.test.ts
git commit -m "feat(domain): capSteps helper for the scalable Arc timeline"
```

---

### Task 2: Apply the cap in the chat timeline

**Files:**
- Modify: `src/app/arc/_components/message-list.tsx` (the `ThinkingTrace` function ~241-281 and `ChainOfThoughtTrace` ~185-217)

- [ ] **Step 1: Cap `ThinkingTrace` (in-flight spine)**

In `src/app/arc/_components/message-list.tsx`, update the import on line 9 to add `capSteps`:

```ts
import { stepGlyphKind, summarizeSteps, normalizeArcBody, capSteps } from "@/domain";
```

Replace the `ThinkingTrace` function body so it caps to 5 with a reveal toggle. Replace the whole function (currently lines ~241-281):

```tsx
function ThinkingTrace({ steps, assistantName }: { steps: ArcStep[]; assistantName: string }) {
  const [showAll, setShowAll] = useState(false);
  if (steps.length === 0) return null;
  const { visible, hidden } = capSteps(steps, showAll ? 0 : 5);
  return (
    <div role="status" aria-live="polite" aria-label={`${assistantName} is thinking`} className="flex flex-col">
      {visible.map((s, i) => {
        const done = s.status === "done";
        const isLast = i === visible.length - 1 && hidden === 0;
        return (
          <div key={`${i}-${s.label}`} className="msg-rise flex gap-2.5">
            <div className="flex flex-col items-center">
              {done ? (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)]">
                  <WorkGlyph kind={stepGlyphKind(s)} className="h-3 w-3 text-[var(--accent)]" />
                </span>
              ) : (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--accent)]">
                  <WorkGlyph kind={stepGlyphKind(s)} className="h-3 w-3 text-[var(--accent)]" />
                </span>
              )}
              {!isLast ? (
                <span className={cx("my-1 w-px flex-1", done ? "bg-[var(--accent-border)]" : "bg-[var(--border-hairline)]")} />
              ) : null}
            </div>
            <div className={cx("min-w-0 flex-1", isLast ? "" : "pb-3")}>
              <div className={cx("text-[13px] leading-5", done ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]")}>
                {done ? s.label : <span className="arc-shimmer font-medium">{s.label}</span>}
              </div>
              {s.detail && s.detail.length > 0 ? (
                <div className="mt-1 space-y-0.5 text-xs text-[var(--text-muted)]">
                  {s.detail.map((d, j) => (
                    <div key={`${j}-${d}`}>– {d}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      {hidden > 0 && !showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="ml-[1.9rem] mt-1 self-start rounded-md text-[11px] font-medium text-[var(--accent)] transition hover:text-[var(--text-primary)]"
        >
          ＋{hidden} more {hidden === 1 ? "step" : "steps"}
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Cap `ChainOfThoughtTrace` (settled trace)**

Replace the `ChainOfThoughtTrace` function (currently ~185-217) so its content caps too:

```tsx
function ChainOfThoughtTrace({
  steps,
  title,
  defaultOpen,
}: {
  steps: ArcStep[];
  title: ReactNode;
  defaultOpen?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (steps.length === 0) return null;
  const { visible, hidden } = capSteps(steps, showAll ? 0 : 5);
  return (
    <ChainOfThought defaultOpen={defaultOpen}>
      <ChainOfThoughtHeader>{title}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {visible.map((s, i) => (
          <ChainOfThoughtStep
            key={`${i}-${s.label}`}
            label={s.label}
            status={s.status === "done" ? "complete" : "active"}
          >
            {s.detail && s.detail.length > 0 ? (
              <div className="space-y-0.5 text-[var(--text-muted)] text-xs">
                {s.detail.map((d, j) => (
                  <div key={`${j}-${d}`}>– {d}</div>
                ))}
              </div>
            ) : null}
          </ChainOfThoughtStep>
        ))}
        {hidden > 0 && !showAll ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-md text-[11px] font-medium text-[var(--accent)] transition hover:text-[var(--text-primary)]"
          >
            ＋{hidden} more {hidden === 1 ? "step" : "steps"}
          </button>
        ) : null}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
```

`useState` and `ReactNode` are already imported at the top of the file (line 3) — no import change needed beyond Step 1's `capSteps`.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm exec eslint src/app/arc/_components/message-list.tsx`
Expected: no errors.
Run: `pnpm build`
Expected: compiles (this also typechecks).

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/message-list.tsx
git commit -m "feat(arc): cap the chat work timeline to first 5 + N more"
```

---

## FEATURE 2 — Recalled-from-memory chips

### Task 3: `recallRelevance` pure helper

**Files:**
- Modify: `src/domain/brain-recall.ts`
- Test: `src/domain/__tests__/recall-relevance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/recall-relevance.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { recallRelevance, type RecallCandidate } from "@/domain";

const cand = (over: Partial<RecallCandidate> = {}): RecallCandidate => ({
  id: "n1",
  kind: "note",
  label: "Landlord persona playbook",
  summary: "Re-engage landlords before storm season",
  tags: ["landlord", "storm"],
  trustTier: "trusted",
  ...over,
});

describe("recallRelevance", () => {
  it("returns a value in [0,1]", () => {
    const score = recallRelevance(cand(), "landlords going cold before storm season");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("scores trusted higher than observed for the same text overlap", () => {
    const msg = "landlord storm";
    expect(recallRelevance(cand({ trustTier: "trusted" }), msg)).toBeGreaterThan(
      recallRelevance(cand({ trustTier: "observed" }), msg),
    );
  });

  it("scores higher with more keyword overlap", () => {
    const strong = recallRelevance(cand(), "landlord storm playbook");
    const weak = recallRelevance(cand(), "unrelated invoice topic");
    expect(strong).toBeGreaterThan(weak);
  });

  it("never exceeds 1 even with heavy overlap", () => {
    const score = recallRelevance(cand(), "landlord storm playbook re-engage persona");
    expect(score).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/recall-relevance.test.ts`
Expected: FAIL — `recallRelevance` is not exported.

- [ ] **Step 3: Implement**

In `src/domain/brain-recall.ts`, add after the `selectRecall` function (after line ~69). Reuse the existing `tokenize` and `candidateText` helpers already in the file:

```ts
const TIER_CONFIDENCE_BASE: Record<string, number> = { trusted: 0.7, observed: 0.5 };

/**
 * A 0–1 confidence that a recalled node is relevant to the operator message.
 * Blends trust tier (a node the operator confirmed counts more) with keyword
 * overlap against the message. Deterministic and pure — used to rank and to show
 * a confidence read on the chat recall chips.
 */
export function recallRelevance(candidate: RecallCandidate, message: string): number {
  const base = TIER_CONFIDENCE_BASE[candidate.trustTier] ?? 0.4;
  const tokens = [...new Set(tokenize(message))];
  if (tokens.length === 0) return base;
  const text = candidateText(candidate);
  const matched = tokens.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
  const overlap = matched / tokens.length; // 0..1
  const bonus = Math.min(0.3, overlap * 0.3);
  return Math.min(1, base + bonus);
}
```

`recallRelevance` and `RecallCandidate` are exported from this module; verify `src/domain/index.ts` re-exports `brain-recall` (it does for `selectRecall`/`RecallItem`). If it uses an explicit list, add `recallRelevance` to it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/recall-relevance.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/brain-recall.ts src/domain/index.ts src/domain/__tests__/recall-relevance.test.ts
git commit -m "feat(domain): recallRelevance confidence for memory chips"
```

---

### Task 4: Thread confidence + nodeId into recall items

**Files:**
- Modify: `src/domain/brain-recall.ts` (`RecallItem`, `EnrichOptions`, `enrichRecall`)
- Modify: `src/lib/knowledge-graph/recall.ts` (`getRecallMemory`)
- Test: extend `src/domain/__tests__/recall-relevance.test.ts` (or a brain-recall test) — see Step 1

- [ ] **Step 1: Write the failing test**

Append to `src/domain/__tests__/recall-relevance.test.ts`:

```ts
import { enrichRecall, type RecallGraph } from "@/domain";

describe("enrichRecall confidence", () => {
  it("attaches confidence + nodeId when a message is provided", () => {
    const selected: RecallCandidate[] = [cand({ id: "n1" })];
    const graph: RecallGraph = { nodes: [{ id: "n1", label: "Landlord persona playbook", kind: "note" }], edges: [] };
    const [item] = enrichRecall(selected, graph, { message: "landlord storm" });
    expect(item.nodeId).toBe("n1");
    expect(typeof item.confidence).toBe("number");
    expect(item.confidence).toBeGreaterThan(0);
  });

  it("omits confidence + nodeId when no message is provided (back-compat)", () => {
    const selected: RecallCandidate[] = [cand({ id: "n1" })];
    const graph: RecallGraph = { nodes: [{ id: "n1", label: "X", kind: "note" }], edges: [] };
    const [item] = enrichRecall(selected, graph);
    expect(item.confidence).toBeUndefined();
    expect(item.nodeId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/recall-relevance.test.ts`
Expected: FAIL — `item.nodeId`/`item.confidence` are undefined in the first case (and `message` is not an accepted option).

- [ ] **Step 3: Implement**

In `src/domain/brain-recall.ts`:

Extend `RecallItem` (line 18):

```ts
export type RecallItem = {
  label: string;
  summary: string | null;
  kind: string;
  related?: string[];
  /** 0–1 relevance confidence (set when enrichRecall is given the message). */
  confidence?: number;
  /** Source brain node id, so the UI can link the chip back to the brain. */
  nodeId?: string;
};
```

Extend `EnrichOptions` (line ~150) to add `message`:

```ts
export type EnrichOptions = {
  enrichLimit?: number;
  relationsPerNode?: number;
  depth?: number;
  maxPerSeed?: number;
  /** When set, each item gets a confidence (recallRelevance) + nodeId. */
  message?: string;
};
```

In `enrichRecall` (line ~179), change the `base` item construction so it carries confidence/nodeId when a message is present. Replace the `return selected.map((c) => { const base ... })` opening so `base` becomes:

```ts
  return selected.map((c) => {
    const base: RecallItem = {
      label: c.label,
      summary: c.summary,
      kind: c.kind,
      ...(options.message !== undefined
        ? { confidence: recallRelevance(c, options.message), nodeId: c.id }
        : {}),
    };
    const conns = traversal.get(c.id);
    if (!conns || conns.length === 0) return base;
    // ...unchanged related-line logic...
    return related.length ? { ...base, related } : base;
  });
```

(Keep the existing `related` computation between those lines exactly as-is.)

In `src/lib/knowledge-graph/recall.ts`, pass the message into `enrichRecall` (currently `return enrichRecall(selected, recallGraph);`):

```ts
  return enrichRecall(selected, recallGraph, { message });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/recall-relevance.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/domain/brain-recall.ts src/lib/knowledge-graph/recall.ts src/domain/__tests__/recall-relevance.test.ts
git commit -m "feat(brain): recall items carry confidence + source node id"
```

---

### Task 5: Runner emits recalled memory into reply metadata

**Files:**
- Modify: `apps/arc-runner/src/recall.ts` (`RecallItem`)
- Modify: `apps/arc-runner/src/arc.ts` (`ArcTurnResult`, `runArcQuery` return)
- Modify: `apps/arc-runner/src/handler.ts` (metadata assembly)
- Test: `apps/arc-runner/src/handler.test.ts` (extend)

- [ ] **Step 1: Extend the runner's RecallItem**

In `apps/arc-runner/src/recall.ts`, the items are passed through from the app route; extend the type so confidence/nodeId survive to metadata:

```ts
export type RecallItem = {
  label: string;
  summary: string | null;
  kind: string;
  related?: string[];
  confidence?: number;
  nodeId?: string;
};
```

- [ ] **Step 2: Add `memory` to the turn result**

In `apps/arc-runner/src/arc.ts`:

Add the import for `RecallItem` (extend the existing `./recall` import on line 6):

```ts
import { buildRecallQuery, resolveRecallMemory, type RecallItem } from "./recall";
```

Extend `ArcTurnResult` (lines 26-33) — add a `memory` field:

```ts
export type ArcTurnResult = {
  body: string;
  actions: ArcActionCard[];
  suggestions: string[];
  sources: ArcMention[];
  questions: ArcQuestion[];
  memory: RecallItem[];
  usage: { model: string; inputTokens: number | null; outputTokens: number | null };
};
```

In `runArcQuery`'s return (lines 163-170), add `memory` from the already-resolved context:

```ts
  return {
    body: (resultText || assistantText).trim(),
    actions,
    suggestions: suggestions.slice(0, 4),
    sources,
    questions: questions.slice(0, 4),
    memory: opts.ctx.memory ?? [],
    usage: { model: opts.inference.model, inputTokens, outputTokens },
  };
```

(`opts.ctx.memory` is the `RecallItem[]` resolved in `runArcTurn`/`runArcOpportunity*` and stored on `ctx.memory` — no other call site changes are needed.)

- [ ] **Step 3: Attach `metadata.recall` in the handler**

In `apps/arc-runner/src/handler.ts`, in the metadata assembly block (lines 18-31), add the recall line alongside actions/suggestions/questions:

```ts
    const metadata: Record<string, unknown> = {};
    if (result.actions.length > 0) metadata.actions = result.actions;
    if (result.suggestions.length > 0) metadata.suggestions = result.suggestions;
    if (result.questions.length > 0) metadata.questions = result.questions;
    if (result.memory.length > 0) metadata.recall = result.memory;
```

Apply the same `metadata.recall` line at the **second** metadata-assembly site in this file (the grounding scan flagged ~line 133 — search the file for `metadata.suggestions = result.suggestions` and add the recall line after each occurrence).

- [ ] **Step 4: Extend the handler test**

In `apps/arc-runner/src/handler.test.ts`, find the test that mocks the turn result with `actions: [...]` and asserts the posted `metadata`. Add `memory` to the mocked result and assert it flows to `metadata.recall`. Mirror the file's existing mock style; the new assertion is:

```ts
// in the mocked ArcTurnResult, add:
memory: [{ label: "Landlord playbook", summary: null, kind: "note", confidence: 0.8, nodeId: "n1" }],

// in the postChatReply expectation, assert metadata includes:
metadata: expect.objectContaining({
  recall: [expect.objectContaining({ label: "Landlord playbook", confidence: 0.8 })],
}),
```

Also confirm any existing mocked result objects in the file now include `memory: []` so they satisfy the extended `ArcTurnResult` type (the test mock object literals must add `memory: []` to typecheck).

- [ ] **Step 5: Run the runner suite + typecheck**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: PASS (including the new recall assertion). If a mock object errors on the missing `memory`, add `memory: []` to it.
Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/arc-runner/src/recall.ts apps/arc-runner/src/arc.ts apps/arc-runner/src/handler.ts apps/arc-runner/src/handler.test.ts
git commit -m "feat(runner): surface recalled memory as metadata.recall on replies"
```

---

### Task 6: Domain `ArcRecall` + `parseRecall`

**Files:**
- Modify: `src/domain/arc-chat.ts`
- Modify: `src/domain/index.ts`
- Test: `src/domain/__tests__/parse-recall.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/parse-recall.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseRecall } from "@/domain";

describe("parseRecall", () => {
  it("parses well-formed items", () => {
    const out = parseRecall([
      { label: "Landlord playbook", confidence: 0.9, kind: "note", nodeId: "n1" },
      { label: "Storm email won 31%", confidence: 0.7 },
    ]);
    expect(out).toEqual([
      { label: "Landlord playbook", confidence: 0.9, kind: "note", nodeId: "n1" },
      { label: "Storm email won 31%", confidence: 0.7 },
    ]);
  });

  it("drops items without a label and never throws", () => {
    expect(parseRecall([{ confidence: 0.5 }, "junk", null, 42])).toEqual([]);
  });

  it("clamps confidence to [0,1] and drops non-numeric", () => {
    expect(parseRecall([{ label: "A", confidence: 5 }])[0].confidence).toBe(1);
    expect(parseRecall([{ label: "B", confidence: -2 }])[0].confidence).toBe(0);
    expect(parseRecall([{ label: "C", confidence: "x" }])[0].confidence).toBeUndefined();
  });

  it("returns [] for non-arrays", () => {
    expect(parseRecall(undefined)).toEqual([]);
    expect(parseRecall({})).toEqual([]);
  });

  it("caps to 8 items", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `n${i}` }));
    expect(parseRecall(many)).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/parse-recall.test.ts`
Expected: FAIL — `parseRecall` is not exported.

- [ ] **Step 3: Implement**

In `src/domain/arc-chat.ts`, add near the other parsers (after `parseActions`, before `parseQuestions`). Reuse the existing `str` helper in the file:

```ts
/** A memory line Arc recalled from the brain, surfaced as a chat evidence chip. */
export type ArcRecall = {
  label: string;
  confidence?: number;
  kind?: string;
  nodeId?: string;
};

/** Parse Arc's recalled-memory items from message metadata. Defensive: requires a
 *  label, clamps confidence to [0,1], drops malformed entries, never throws. */
export function parseRecall(value: unknown): ArcRecall[] {
  if (!Array.isArray(value)) return [];
  const out: ArcRecall[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = str((item as { label?: unknown }).label);
    if (!label) continue;
    const rawConfidence = (item as { confidence?: unknown }).confidence;
    const confidence =
      typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
        ? Math.min(1, Math.max(0, rawConfidence))
        : undefined;
    out.push({
      label,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(str((item as { kind?: unknown }).kind) ? { kind: str((item as { kind?: unknown }).kind) } : {}),
      ...(str((item as { nodeId?: unknown }).nodeId) ? { nodeId: str((item as { nodeId?: unknown }).nodeId) } : {}),
    });
    if (out.length >= 8) break;
  }
  return out;
}
```

Export both from `src/domain/index.ts` — extend the existing `arc-chat` export line (search for `from "./arc-chat"`) to include `parseRecall` and the `ArcRecall` type:

```ts
export { /* …existing… */ parseRecall } from "./arc-chat";
export type { /* …existing… */ ArcRecall } from "./arc-chat";
```

(If `index.ts` uses `export * from "./arc-chat"`, no change is needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/parse-recall.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/arc-chat.ts src/domain/index.ts src/domain/__tests__/parse-recall.test.ts
git commit -m "feat(domain): ArcRecall type + defensive parseRecall"
```

---

### Task 7: Surface `recall` on `ArcMessage`

**Files:**
- Modify: `src/lib/arc-chat/persistence.ts`

- [ ] **Step 1: Extend the import + type**

In `src/lib/arc-chat/persistence.ts`, line 3, add `ArcRecall` + `parseRecall`:

```ts
import { type ArcActionCard, type ArcMedia, type ArcMention, type ArcMode, type ArcQuestion, type ArcRecall, type ArcRoute, type ArcStepKind, parseActions, parseMedia, parseMentions, parseQuestions, parseRecall } from "@/domain";
```

In the `ArcMessage` type (lines 49-80), add `recall` after `questions`:

```ts
  /** Memory lines Arc recalled from the brain for this reply (agent-provided),
   *  shown as evidence chips. Absent on rows without them. */
  recall?: ArcRecall[];
```

- [ ] **Step 2: Parse it in `toMessage`**

In `toMessage` (lines 211-240), add the recall parse alongside `actions`/`questions`:

```ts
    recall: parseRecall((row.metadata as { recall?: unknown } | null)?.recall),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: compiles.
Run: `pnpm exec eslint src/lib/arc-chat/persistence.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/arc-chat/persistence.ts
git commit -m "feat(arc): thread recalled memory onto ArcMessage"
```

---

### Task 8: Render recall chips in the chat

**Files:**
- Create: `src/app/arc/_components/recall-chips.tsx`
- Modify: `src/app/arc/_components/message-list.tsx`

- [ ] **Step 1: Create the chip row component**

Create `src/app/arc/_components/recall-chips.tsx`:

```tsx
import { EvidenceChip } from "@/app/_components/evidence-chip";
import type { ArcRecall } from "@/domain";

/**
 * "Recalled from memory" row shown at the top of an Arc reply — proves Arc
 * reasoned from the brain, not from nothing. Each item links back to the Brain
 * when a source node is known. Hidden when empty.
 */
export function RecallChips({ items }: { items: ArcRecall[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Recalled from memory
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <EvidenceChip
            key={`${i}-${item.label}`}
            label={item.label}
            confidence={item.confidence}
            href={item.nodeId ? "/brain" : undefined}
          />
        ))}
      </div>
    </div>
  );
}
```

(v1 links to `/brain`; node-focus deep-linking is a future enhancement — the `nodeId` is already threaded for it.)

- [ ] **Step 2: Render it above the body**

In `src/app/arc/_components/message-list.tsx`, add the import near the other component imports (~line 19):

```tsx
import { RecallChips } from "./recall-chips";
```

In the Arc/system branch of `Message`, render the chips immediately before the settled `<ArcBody>` (the `else` branch around line 838-840). Change:

```tsx
        ) : (
          <ArcBody body={message.body} />
        )}
```

to:

```tsx
        ) : (
          <>
            {message.recall && message.recall.length > 0 ? <RecallChips items={message.recall} /> : null}
            <ArcBody body={message.body} />
          </>
        )}
```

- [ ] **Step 3: Typecheck + lint + preview**

Run: `pnpm exec eslint src/app/arc/_components/recall-chips.tsx src/app/arc/_components/message-list.tsx`
Expected: no errors.
Run: `pnpm build`
Expected: compiles.
Verify in the preview harness: a completed Arc reply whose row metadata has `recall` shows the chip row above the body with confidence %.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/recall-chips.tsx src/app/arc/_components/message-list.tsx
git commit -m "feat(arc): render recalled-from-memory chips on Arc replies"
```

---

## FEATURE 3 — Inline approve + comment-to-revise

### Task 9: Inline decision controls in the chat draft card

**Files:**
- Create: `src/app/arc/_components/draft-decision-controls.tsx`
- Modify: `src/app/arc/_components/action-card.tsx`

- [ ] **Step 1: Create the controls component**

Create `src/app/arc/_components/draft-decision-controls.tsx` (modeled on `src/app/campaigns/_components/piece-decision.tsx`, reusing the campaigns server actions which are `useActionState`-shaped and operator-gated):

```tsx
"use client";

import { useActionState, useId, useState } from "react";

import { MAX_REVISION_INSTRUCTION_LENGTH } from "@/domain";

import { decideAssetAction, requestRevisionAction } from "@/app/campaigns/actions";

/**
 * Inline Approve / Comment-&-revise / Decline for an Arc draft card — the same
 * three real backend paths as the campaign builder, but in the chat thread so the
 * operator never has to leave for Studio. Approve unlocks the piece for launch;
 * Comment & revise reveals a notes field and sends Arc the change in place
 * (asset → 'revision requested'); Decline removes it. Outbound stays locked.
 */
export function DraftDecisionControls({ campaignId, assetId }: { campaignId: string; assetId: string }) {
  const [decideState, decideAction, deciding] = useActionState(decideAssetAction, null);
  const [reworkState, reworkAction, reworking] = useActionState(requestRevisionAction, null);
  const [reworkOpen, setReworkOpen] = useState(false);
  const reworkFieldId = useId();
  const reworkDone = reworkState?.ok === true;

  return (
    <div className="flex w-full flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <form action={decideAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <button
            type="submit"
            name="decision"
            value="approved"
            disabled={deciding}
            className="rounded-md border border-[var(--ok-border)] bg-[var(--ok-solid)] px-3 py-1 text-xs font-semibold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)] disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="submit"
            name="decision"
            value="declined"
            disabled={deciding}
            className="rounded-md border border-[var(--border-hairline)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--priority-bright)] hover:text-[var(--priority-bright)] disabled:opacity-60"
          >
            Decline
          </button>
        </form>
        <button
          type="button"
          onClick={() => setReworkOpen((open) => !open)}
          aria-expanded={reworkOpen}
          aria-controls={reworkFieldId}
          className="rounded-md border border-[var(--accent-border-strong)] px-3 py-1 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent-soft)]"
        >
          {reworkOpen ? "Cancel" : "Comment & revise"}
        </button>
        {decideState ? (
          <span className={`text-xs font-semibold ${decideState.ok ? "text-[var(--ok-text)]" : "text-[var(--warn-text)]"}`}>
            {decideState.message}
          </span>
        ) : null}
        {reworkDone ? <span className="text-xs font-semibold text-[var(--ok-text)]">{reworkState?.message}</span> : null}
      </div>

      {reworkOpen && !reworkDone ? (
        <form action={reworkAction} className="space-y-2 rounded-lg border border-[var(--accent-border)] bg-[var(--surface-panel)] p-3">
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <label htmlFor={reworkFieldId} className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Tell Arc what to change
          </label>
          <textarea
            id={reworkFieldId}
            name="instruction"
            rows={3}
            maxLength={MAX_REVISION_INSTRUCTION_LENGTH}
            placeholder="e.g. Make the opening warmer and drop the deadline pressure."
            className="w-full resize-y rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={reworking}
              className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {reworking ? "Sending…" : "Send to Arc"}
            </button>
            <span className="text-[11px] text-[var(--text-muted)]">Arc redrafts in place; outbound stays locked.</span>
            {reworkState && !reworkState.ok ? (
              <span className="text-xs font-semibold text-[var(--warn-text)]">{reworkState.message}</span>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Swap the ActionCard footer to the new controls**

In `src/app/arc/_components/action-card.tsx`, add the import:

```tsx
import { DraftDecisionControls } from "./draft-decision-controls";
```

Replace the entire `isDraft && card.approval` footer block (lines 128-154, the three `decideCampaignDraftAction`/Link forms + LockNote) with:

```tsx
      {isDraft && card.approval ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] px-3 py-2.5">
          <DraftDecisionControls campaignId={card.approval.campaignId} assetId={card.approval.assetId} />
          <LockNote />
        </div>
      ) : null}
```

Leave `decideCampaignDraftAction` defined in `src/app/arc/actions.ts` (other callers may use it); it's simply no longer used by `ActionCard`. Remove its now-unused import from `action-card.tsx` (the line `import { decideCampaignDraftAction } from "../actions";`) to keep lint clean.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm exec eslint src/app/arc/_components/draft-decision-controls.tsx src/app/arc/_components/action-card.tsx`
Expected: no errors (no unused-import warning for `decideCampaignDraftAction`).
Run: `pnpm build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/draft-decision-controls.tsx src/app/arc/_components/action-card.tsx
git commit -m "feat(arc): inline approve + comment-to-revise on chat draft cards"
```

---

### Task 10: "Approve all clean" for multi-draft decks

**Files:**
- Modify: `src/domain/arc-chat.ts` (`cleanApprovableDrafts`)
- Modify: `src/domain/index.ts`
- Modify: `src/app/arc/actions.ts` (`approveCleanDraftsAction`)
- Modify: `src/app/arc/_components/campaign-deck.tsx`
- Test: `src/domain/__tests__/clean-approvable.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/clean-approvable.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { cleanApprovableDrafts, type ArcActionCard } from "@/domain";

const draft = (over: Partial<ArcActionCard> = {}): ArcActionCard => ({
  kind: "draft",
  title: "Email",
  rows: [],
  flags: [],
  approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
  ...over,
});

describe("cleanApprovableDrafts", () => {
  it("returns approval ids for flagless, undecided drafts with an approval block", () => {
    expect(cleanApprovableDrafts([draft({ approval: { kind: "campaign", campaignId: "c1", assetId: "a1" } })])).toEqual([
      { campaignId: "c1", assetId: "a1" },
    ]);
  });

  it("excludes drafts with a warn or risk flag", () => {
    expect(cleanApprovableDrafts([draft({ flags: [{ tone: "risk", label: "claim risk" }] })])).toEqual([]);
    expect(cleanApprovableDrafts([draft({ flags: [{ tone: "warn", label: "check" }] })])).toEqual([]);
  });

  it("excludes already-decided drafts", () => {
    expect(cleanApprovableDrafts([draft({ status: "approved" })])).toEqual([]);
    expect(cleanApprovableDrafts([draft({ status: "revision" })])).toEqual([]);
    expect(cleanApprovableDrafts([draft({ status: "rejected" })])).toEqual([]);
  });

  it("excludes cards without an approval block or that aren't drafts", () => {
    expect(cleanApprovableDrafts([draft({ approval: undefined })])).toEqual([]);
    expect(cleanApprovableDrafts([draft({ kind: "result" })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/clean-approvable.test.ts`
Expected: FAIL — `cleanApprovableDrafts` is not exported.

- [ ] **Step 3: Implement the helper**

In `src/domain/arc-chat.ts`, add after `parseActions`:

```ts
/** The approval ids of draft cards safe to bulk-approve: a draft, with an
 *  approval block, not yet decided, and carrying no warn/risk flags. Pure. */
export function cleanApprovableDrafts(cards: ArcActionCard[]): { campaignId: string; assetId: string }[] {
  return cards
    .filter(
      (c) =>
        c.kind === "draft" &&
        c.approval &&
        c.status !== "approved" &&
        c.status !== "rejected" &&
        c.status !== "revision" &&
        !c.flags.some((f) => f.tone === "warn" || f.tone === "risk"),
    )
    .map((c) => ({ campaignId: c.approval!.campaignId, assetId: c.approval!.assetId }));
}
```

Export `cleanApprovableDrafts` from `src/domain/index.ts` (same line/pattern as `parseActions`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/clean-approvable.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the bulk server action**

In `src/app/arc/actions.ts`, add next to `decideCampaignDraftAction` (reuse its imports — `requireOperator`, `isSupabaseAdminConfigured`, `decideAsset`, `getOperatorActor`, `revalidatePath`):

```ts
/** Approve every clean (flagless, undecided) draft in a chat reply in one click.
 *  Each id pair is approved via the same campaign decision lib; outbound stays
 *  locked. Operator-gated; no-op when Supabase isn't configured. */
export async function approveCleanDraftsAction(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  let pairs: { campaignId: string; assetId: string }[] = [];
  try {
    const raw = JSON.parse(String(formData.get("drafts") ?? "[]"));
    if (Array.isArray(raw)) {
      pairs = raw
        .filter((p): p is { campaignId: string; assetId: string } =>
          !!p && typeof p.campaignId === "string" && typeof p.assetId === "string" && !!p.assetId)
        .slice(0, 24);
    }
  } catch {
    return;
  }
  const operator = await getOperatorActor();
  for (const { campaignId, assetId } of pairs) {
    await decideAsset({ assetId, campaignId, decision: "approved", operator }).catch(() => undefined);
  }
  revalidatePath("/arc");
  revalidatePath("/campaigns");
}
```

- [ ] **Step 6: Wire the deck control**

In `src/app/arc/_components/campaign-deck.tsx`, import the helper + action:

```tsx
import { cleanApprovableDrafts } from "@/domain";
import { approveCleanDraftsAction } from "../actions";
```

At the top of the deck component (where `cards` are in scope, before the cards render), compute the clean set and render a header control when non-empty. Add this just above the deck's card list (adjust to the file's existing header/wrapper):

```tsx
  const cleanDrafts = cleanApprovableDrafts(cards);
```

```tsx
  {cleanDrafts.length > 0 ? (
    <form action={approveCleanDraftsAction} className="mb-2 flex items-center justify-end">
      <input type="hidden" name="drafts" value={JSON.stringify(cleanDrafts)} />
      <button
        type="submit"
        className="rounded-md border border-[var(--ok-border)] bg-[var(--ok-soft)] px-3 py-1 text-xs font-semibold text-[var(--ok-text)] transition hover:bg-[var(--ok-solid)] hover:text-[var(--on-ok)]"
      >
        Approve all clean ({cleanDrafts.length})
      </button>
    </form>
  ) : null}
```

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm exec eslint src/app/arc/actions.ts src/app/arc/_components/campaign-deck.tsx`
Expected: no errors.
Run: `pnpm build`
Expected: compiles.

- [ ] **Step 8: Commit**

```bash
git add src/domain/arc-chat.ts src/domain/index.ts src/domain/__tests__/clean-approvable.test.ts src/app/arc/actions.ts src/app/arc/_components/campaign-deck.tsx
git commit -m "feat(arc): approve-all-clean control for multi-draft decks"
```

---

### Task 11: Lift provenance into the card header

**Files:**
- Modify: `src/app/arc/_components/action-card.tsx`

- [ ] **Step 1: Add a provenance subtitle to the header**

In `src/app/arc/_components/action-card.tsx`, the header (lines 50-87) renders icon + title + StatusPill + SaveStar + Review link. Wrap the title in a column that adds a muted provenance line for draft cards. Replace the title `<span>` (line 58):

```tsx
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{card.title}</span>
```

with:

```tsx
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{card.title}</div>
          {isDraft ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--text-muted)]">
              <span className="text-[var(--ok-text)]">Drafted by Arc</span>
              {card.channel ? (<><span aria-hidden>·</span><span>{card.channel}</span></>) : null}
              {card.format ? (<><span aria-hidden>·</span><span>{card.format}</span></>) : null}
              {media?.source ? (<><span aria-hidden>·</span><span>{media.source.replace(/_/g, " ")}</span></>) : null}
            </div>
          ) : null}
        </div>
```

(`media` is already computed on line 47: `const media = image ?? card.media;`. The existing `MediaProvenance` below the media stays — the header line is the at-a-glance accountability cue.)

- [ ] **Step 2: Typecheck + lint + preview**

Run: `pnpm exec eslint src/app/arc/_components/action-card.tsx`
Expected: no errors.
Run: `pnpm build`
Expected: compiles.
Verify in preview: a draft card header shows "Drafted by Arc · <channel> · <format>" under the title.

- [ ] **Step 3: Commit**

```bash
git add src/app/arc/_components/action-card.tsx
git commit -m "feat(arc): lift draft provenance into the card header"
```

---

## FEATURE 4 — Deep-link app-state cards

### Task 12: Domain support for the `navigate` card kind

**Files:**
- Modify: `src/domain/arc-chat.ts` (`ArcActionCard`, `parseActions`)
- Test: `src/domain/__tests__/parse-navigate-card.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/parse-navigate-card.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseActions } from "@/domain";

describe("parseActions — navigate kind", () => {
  it("parses a valid navigate card with appState", () => {
    const [card] = parseActions([
      {
        kind: "navigate",
        title: "Open the 3 matching leads in CRM",
        appState: { href: "/crm/leads?persona=landlord", filters: ["persona: landlord", "last touch > 60d"] },
      },
    ]);
    expect(card.kind).toBe("navigate");
    expect(card.appState).toEqual({ href: "/crm/leads?persona=landlord", filters: ["persona: landlord", "last touch > 60d"] });
  });

  it("drops a navigate card with an external href", () => {
    expect(
      parseActions([{ kind: "navigate", title: "Bad", appState: { href: "https://evil.example.com", filters: [] } }]),
    ).toEqual([]);
  });

  it("drops a navigate card with no appState", () => {
    expect(parseActions([{ kind: "navigate", title: "No destination" }])).toEqual([]);
  });

  it("still parses result/draft cards unchanged", () => {
    const out = parseActions([{ kind: "result", title: "Found", rows: [] }]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("result");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/parse-navigate-card.test.ts`
Expected: FAIL — navigate cards are dropped (kind not in `result|draft`).

- [ ] **Step 3: Implement**

In `src/domain/arc-chat.ts`:

Extend `ArcActionCard` (lines 190-203) — add the kind + `appState`:

```ts
export type ArcAppState = { href: string; filters: string[] };
export type ArcActionCard = {
  kind: "result" | "draft" | "navigate";
  title: string;
  href?: string;
  rows: ArcActionRow[];
  preview?: string;
  flags: ArcActionFlag[];
  approval?: ArcActionApproval;
  media?: ArcMedia;
  channel?: string;
  format?: string;
  status?: ArcAssetStatus;
  /** Deep-link target for kind:"navigate" cards (pre-filtered in-app view). */
  appState?: ArcAppState;
};
```

Add a parser for `appState` (near `parseApproval`):

```ts
function parseAppState(value: unknown): ArcAppState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const href = str((value as { href?: unknown }).href);
  // In-app routes only — never an external URL.
  if (!href || !href.startsWith("/")) return undefined;
  const rawFilters = (value as { filters?: unknown }).filters;
  const filters = Array.isArray(rawFilters)
    ? rawFilters.filter((f): f is string => typeof f === "string" && f.trim().length > 0).map((f) => f.trim()).slice(0, 6)
    : [];
  return { href, filters };
}
```

In `parseActions` (lines 251-281), accept the navigate kind and parse `appState`. Change the kind guard (line 258):

```ts
    if ((kind !== "result" && kind !== "draft" && kind !== "navigate") || !title) continue;
    const appState = kind === "navigate" ? parseAppState((item as { appState?: unknown }).appState) : undefined;
    // A navigate card with no valid in-app destination is useless — drop it.
    if (kind === "navigate" && !appState) continue;
```

Add `appState` to the pushed object (in the `out.push({...})` near line 266):

```ts
      ...(appState ? { appState } : {}),
```

Export `ArcAppState` from `src/domain/index.ts` if the index uses an explicit type-export list.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/parse-navigate-card.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/arc-chat.ts src/domain/index.ts src/domain/__tests__/parse-navigate-card.test.ts
git commit -m "feat(domain): navigate card kind with validated in-app appState"
```

---

### Task 13: Runner emits navigate cards

**Files:**
- Modify: `apps/arc-runner/src/types.ts` (`ArcActionCard`)
- Modify: `apps/arc-runner/src/tools/cards.ts` (`emit_card`)
- Test: `apps/arc-runner/src/tools/cards.test.ts`

- [ ] **Step 1: Write the failing test**

In `apps/arc-runner/src/tools/cards.test.ts`, add a test inside the existing `describe("emit_card", ...)` block (mirror the existing handler-invocation style in that file):

```ts
  it("collects a navigate card with appState", async () => {
    const collected: ArcActionCard[] = [];
    const tool = emitCardTool((c) => collected.push(c));
    await tool.handler(
      {
        kind: "navigate",
        title: "Open the 3 matching leads in CRM",
        appState: { href: "/crm/leads?persona=landlord", filters: ["persona: landlord"] },
      },
      {} as never,
    );
    expect(collected[0]).toMatchObject({
      kind: "navigate",
      title: "Open the 3 matching leads in CRM",
      appState: { href: "/crm/leads?persona=landlord", filters: ["persona: landlord"] },
    });
  });
```

(Match the exact handler-call signature used by the existing tests in this file — they already call the tool handler; copy that call shape.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bsr/arc-runner exec vitest run src/tools/cards.test.ts`
Expected: FAIL — `kind` enum rejects `navigate` / `appState` not collected.

- [ ] **Step 3: Implement**

In `apps/arc-runner/src/types.ts`, extend `ArcActionCard` (lines 121-133):

```ts
export type ArcAppState = { href: string; filters?: string[] };
export type ArcActionCard = {
  kind: "result" | "draft" | "navigate";
  title: string;
  href?: string;
  rows: ArcActionRow[];
  flags: ArcActionFlag[];
  preview?: string;
  approval?: ArcActionApproval;
  channel?: string;
  format?: string;
  status?: "draft" | "revision" | "approved" | "rejected";
  media?: ArcMedia;
  appState?: ArcAppState;
};
```

In `apps/arc-runner/src/tools/cards.ts`, extend the zod schema: change `kind` and add `appState`:

```ts
      kind: z.enum(["result", "draft", "navigate"]),
```

Add inside the schema object (after `media`):

```ts
      appState: z
        .object({
          href: z.string().describe("In-app route only, must start with '/'. Build it from get_app_map routes + query filters."),
          filters: z.array(z.string()).optional().describe("Human-readable filter labels shown as chips, e.g. 'persona: landlord'."),
        })
        .optional()
        .describe("For kind:'navigate' — a pre-filtered in-app view the operator opens in one click."),
```

Update the tool description string to mention the new kind (append to the existing description):

```
" Use kind 'navigate' to hand back a one-click deep link into the app: set appState.href to an in-app route (from get_app_map) with query filters, and appState.filters to the human-readable filter labels."
```

Add `appState` to the built card object in the handler (after `...(args.media ? { media: args.media } : {})`):

```ts
        ...(args.appState ? { appState: args.appState } : {}),
```

- [ ] **Step 4: Run the test + full runner suite + typecheck**

Run: `pnpm --filter @bsr/arc-runner exec vitest run src/tools/cards.test.ts`
Expected: PASS (including the new navigate test).
Run: `pnpm --filter @bsr/arc-runner test`
Expected: PASS — the tool-surface tests in `tools/index.test.ts` are name-pinned, not schema-pinned, so adding a kind does not break them.
Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/arc-runner/src/types.ts apps/arc-runner/src/tools/cards.ts apps/arc-runner/src/tools/cards.test.ts
git commit -m "feat(runner): emit_card supports navigate kind + appState deep links"
```

---

### Task 14: Render the navigate card

**Files:**
- Create: `src/app/arc/_components/navigate-card.tsx`
- Modify: `src/app/arc/_components/action-card.tsx`

- [ ] **Step 1: Create the navigate card component**

Create `src/app/arc/_components/navigate-card.tsx`:

```tsx
import Link from "next/link";

import type { ArcActionCard } from "@/domain";

/** A one-click deep link into a pre-filtered app view. Renders only for
 *  kind:"navigate" cards that carry a validated in-app appState. */
export function NavigateCard({ card }: { card: ArcActionCard }) {
  if (!card.appState) return null;
  const { href, filters } = card.appState;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]" aria-hidden>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5h14M3 10h14M3 15h9" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--text-primary)]">{card.title}</div>
        {filters.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span>pre-filtered</span>
            {filters.map((f, i) => (
              <span key={`${i}-${f}`} className="rounded border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[var(--text-secondary)]">
                {f}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <Link href={href} className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--accent-contrast)] transition hover:text-[var(--accent)]">
        Open view
        <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 10h10M11 5l5 5-5 5" />
        </svg>
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Route navigate cards in ActionCard**

In `src/app/arc/_components/action-card.tsx`, add the import:

```tsx
import { NavigateCard } from "./navigate-card";
```

At the very top of the `ActionCard` function body (before `const isDraft = ...`), short-circuit navigate cards:

```tsx
  if (card.kind === "navigate") return <NavigateCard card={card} />;
```

(`message-list.tsx` already routes any non-draft card through `ActionCard` via `nonDraftCards`, so navigate cards reach here with no change to the list. Verify the `draftCards`/`nonDraftCards` split in `message-list.tsx` still treats `kind === "navigate"` as non-draft — it does, since it filters `a.kind === "draft"`.)

- [ ] **Step 3: Typecheck + lint + preview**

Run: `pnpm exec eslint src/app/arc/_components/navigate-card.tsx src/app/arc/_components/action-card.tsx`
Expected: no errors.
Run: `pnpm build`
Expected: compiles.
Verify in preview: a reply whose metadata includes a navigate card renders the deep-link card with filter chips + an "Open view" link to the in-app route.

- [ ] **Step 4: Commit**

```bash
git add src/app/arc/_components/navigate-card.tsx src/app/arc/_components/action-card.tsx
git commit -m "feat(arc): render deep-link app-state navigate cards"
```

---

## FINAL — Verification & safety sweep

### Task 15: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full domain test suite**

Run: `pnpm test src/domain`
Expected: PASS, including the 5 new test files.

- [ ] **Step 2: Full runner suite + typecheck**

Run: `pnpm --filter @bsr/arc-runner test`
Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: PASS / no type errors.

- [ ] **Step 3: App typecheck (authoritative)**

Run: `pnpm build`
Expected: compiles with no type errors.

- [ ] **Step 4: Scoped lint of all touched files**

Run:
```bash
pnpm exec eslint \
  src/app/arc/_components/message-list.tsx \
  src/app/arc/_components/action-card.tsx \
  src/app/arc/_components/campaign-deck.tsx \
  src/app/arc/_components/draft-decision-controls.tsx \
  src/app/arc/_components/recall-chips.tsx \
  src/app/arc/_components/navigate-card.tsx \
  src/app/arc/actions.ts \
  src/lib/arc-chat/persistence.ts \
  src/domain/arc-chat.ts src/domain/brain-recall.ts src/domain/arc-step-summary.ts
```
Expected: no errors.

- [ ] **Step 5: Approval-safety checklist (read, confirm each)**

- [ ] No new code path sends/publishes/launches/spends. `approveCleanDraftsAction` and the `DraftDecisionControls` only call `decideAsset` / `requestAssetRevision` (internal state).
- [ ] `approveCleanDraftsAction` calls `requireOperator()` and short-circuits when Supabase isn't configured.
- [ ] The "outbound locked" cue (`LockNote`) still renders on every draft card footer.
- [ ] Navigate cards only ever link to in-app (`/…`) routes — `parseAppState` rejects external hrefs (covered by Task 12 test).
- [ ] No DB migration was added (grep `supabase/migrations` — unchanged).

- [ ] **Step 6: CI awareness**

Per repo history, CI `verify` is chronically red on env-gated media/web-search route tests (GEMINI/ARC_MEDIA). Before assuming this branch broke CI, confirm *which* tests failed — the suites this plan touches (`src/domain`, `@bsr/arc-runner`, persistence) should be green.

- [ ] **Step 7: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(arc): verification fixups for the chat hero slice"
```

---

## Spec coverage map

- **Feature 1 (scalable timeline):** Tasks 1–2.
- **Feature 2 (recall chips + ranked recall):** Tasks 3–8 (ranking 3–4, runner emit 5, parse 6, persist 7, render 8).
- **Feature 3 (inline approve + comment-to-revise + provenance + approve-all-clean):** Tasks 9–11.
- **Feature 4 (deep-link navigate cards):** Tasks 12–14.
- **Cross-cutting (auth/tenancy, no migration, CI):** Task 15.
- **Deferred (per spec, not in this plan):** true SSE streaming, pgvector embeddings, performance causality, collaborative vault, wiring the new primitives onto Campaigns/Home.
