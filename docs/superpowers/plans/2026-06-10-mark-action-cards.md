# Mark Action Cards Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render what Mark *did* as structured cards instead of prose — result cards (clickable record rows) and draft cards (preview + flags + inline Approve / Decline wired to the real campaign approval flow), driven by `message.metadata.actions[]`.

**Architecture:** App-side only, additive. A new `MarkActionCard` parsed from the existing `mark_messages.metadata` jsonb (like `steps`/`media`). Draft-card Approve/Decline call the campaign decision **library** (`decideAsset`) via a thin chat action; Request-revision links to the campaign page (it needs free text). Degrades gracefully: no `actions` → nothing renders.

**Tech Stack:** Next.js 16 (server actions), React 19, TypeScript, Supabase, vitest, Tailwind v4 (`globals.css`), Signal design system (no emojis).

**Spec:** `docs/superpowers/specs/2026-06-09-mark-chat-premium-experience-design.md` (Action cards section). **Predecessor:** Plan 1 (premium states & composer) — already shipped.

> **Commit hygiene (shared branch):** a parallel agent stages files in the shared git index. For NEW files use `git add <path> && git commit <path> -m "…"` (pathspec form restricts the commit to those paths). For already-tracked files use `git commit <path1> <path2> -m "…"`. Never bare `git commit` / `git commit -a`.

---

## File map

- Modify `src/domain/mark-chat.ts` — `MarkActionCard` (+ sub-types) + `parseActions`; pure, exported via the `@/domain` barrel.
- Modify `src/domain/__tests__/` — new `mark-actions.test.ts` for `parseActions`.
- Modify `src/lib/mark-chat/persistence.ts` — `actions: MarkActionCard[]` on `MarkMessage`; parse in `toMessage`.
- Modify `src/app/mark/_components/use-thread-poll.ts` — `sameMessages` compares `actions.length`.
- Modify `src/app/mark/actions.ts` — `decideCampaignDraftAction(formData)` calling `decideAsset`.
- Create `src/app/mark/_components/action-card.tsx` — renders a `MarkActionCard`.
- Modify `src/app/mark/_components/message-list.tsx` — render `message.actions` above References.
- Modify `docs/mark-worker-contract-premium.md` — add the `actions[]` payload schema.
- Fix `MarkMessage` literals (composer temp, mark-chat optimistic, test fixtures) to include `actions: []`.

---

## Task 1: Domain — `MarkActionCard` + `parseActions` (TDD)

**Files:**
- Modify: `src/domain/mark-chat.ts`
- Test: `src/domain/__tests__/mark-actions.test.ts` (create)

- [ ] **Step 1: Write the failing test** — `src/domain/__tests__/mark-actions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { parseActions } from "../mark-chat";

describe("parseActions", () => {
  it("returns [] for non-arrays / garbage", () => {
    expect(parseActions(undefined)).toEqual([]);
    expect(parseActions(null)).toEqual([]);
    expect(parseActions("x")).toEqual([]);
    expect(parseActions([{ kind: "nope", title: "x" }])).toEqual([]);
    expect(parseActions([{ kind: "result" }])).toEqual([]); // missing title
  });

  it("parses a result card with rows", () => {
    const out = parseActions([
      {
        kind: "result",
        title: "3 leads added",
        href: "/crm/leads",
        rows: [
          { name: "Dana", meta: "Homeowner", badge: "92" },
          { name: "no-name-ignored" }, // kept: name present
          { bad: true }, // dropped: no name
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "result", title: "3 leads added", href: "/crm/leads" });
    expect(out[0].rows).toHaveLength(2);
    expect(out[0].flags).toEqual([]);
  });

  it("parses a draft card with preview, flags, and a campaign approval ref", () => {
    const out = parseActions([
      {
        kind: "draft",
        title: "Draft campaign",
        preview: "When the unexpected hits…",
        flags: [{ tone: "ok", label: "On-brand" }, { tone: "nope", label: "x" }],
        approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
      },
    ]);
    expect(out[0]).toMatchObject({ kind: "draft", title: "Draft campaign", preview: "When the unexpected hits…" });
    expect(out[0].flags).toEqual([{ tone: "ok", label: "On-brand" }]); // invalid tone dropped
    expect(out[0].approval).toEqual({ kind: "campaign", campaignId: "c1", assetId: "a1" });
  });

  it("drops an approval ref missing ids", () => {
    const out = parseActions([{ kind: "draft", title: "d", approval: { kind: "campaign", campaignId: "c1" } }]);
    expect(out[0].approval).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/domain/__tests__/mark-actions.test.ts`
Expected: FAIL — `parseActions` not exported.

- [ ] **Step 3: Implement** — append to the END of `src/domain/mark-chat.ts`:

```typescript
export type MarkActionFlag = { tone: "ok" | "warn" | "risk"; label: string };
export type MarkActionRow = { name: string; meta?: string; badge?: string; href?: string };
export type MarkActionApproval = { kind: "campaign"; campaignId: string; assetId: string };
export type MarkActionCard = {
  kind: "result" | "draft";
  title: string;
  href?: string;
  rows: MarkActionRow[];
  preview?: string;
  flags: MarkActionFlag[];
  approval?: MarkActionApproval;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function parseRows(value: unknown): MarkActionRow[] {
  if (!Array.isArray(value)) return [];
  const out: MarkActionRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const name = str((item as { name?: unknown }).name);
    if (!name) continue;
    out.push({
      name,
      meta: str((item as { meta?: unknown }).meta),
      badge: str((item as { badge?: unknown }).badge),
      href: str((item as { href?: unknown }).href),
    });
  }
  return out;
}

function parseFlags(value: unknown): MarkActionFlag[] {
  if (!Array.isArray(value)) return [];
  const tones = new Set(["ok", "warn", "risk"]);
  const out: MarkActionFlag[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const tone = (item as { tone?: unknown }).tone;
    const label = str((item as { label?: unknown }).label);
    if (typeof tone !== "string" || !tones.has(tone) || !label) continue;
    out.push({ tone: tone as MarkActionFlag["tone"], label });
  }
  return out;
}

function parseApproval(value: unknown): MarkActionApproval | undefined {
  if (!value || typeof value !== "object") return undefined;
  const kind = (value as { kind?: unknown }).kind;
  const campaignId = str((value as { campaignId?: unknown }).campaignId);
  const assetId = str((value as { assetId?: unknown }).assetId);
  if (kind !== "campaign" || !campaignId || !assetId) return undefined;
  return { kind: "campaign", campaignId, assetId };
}

/** Parse Mark's structured action cards from message metadata. Defensive: drops
 *  malformed entries (must have a valid kind + title), never throws. */
export function parseActions(value: unknown): MarkActionCard[] {
  if (!Array.isArray(value)) return [];
  const out: MarkActionCard[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const kind = (item as { kind?: unknown }).kind;
    const title = str((item as { title?: unknown }).title);
    if ((kind !== "result" && kind !== "draft") || !title) continue;
    out.push({
      kind,
      title,
      href: str((item as { href?: unknown }).href),
      rows: parseRows((item as { rows?: unknown }).rows),
      preview: str((item as { preview?: unknown }).preview),
      flags: parseFlags((item as { flags?: unknown }).flags),
      approval: parseApproval((item as { approval?: unknown }).approval),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/domain/__tests__/mark-actions.test.ts`
Expected: PASS (4 tests). (`@/domain` re-exports via `export * from "./mark-chat"`, so `MarkActionCard`/`parseActions` are auto-surfaced — verify the barrel is `export *`; if it's a named list, add them.)

- [ ] **Step 5: Commit**

```bash
git add src/domain/mark-chat.ts src/domain/__tests__/mark-actions.test.ts
git commit src/domain/mark-chat.ts src/domain/__tests__/mark-actions.test.ts -m "feat(mark-chat): MarkActionCard types + parseActions"
```

---

## Task 2: Persistence — `actions` on `MarkMessage` + poll equality

**Files:**
- Modify: `src/lib/mark-chat/persistence.ts`
- Modify: `src/app/mark/_components/use-thread-poll.ts`
- Fix literals: `src/app/mark/_components/composer.tsx`, `src/app/mark/_components/mark-chat.tsx`, `src/app/mark/_components/use-thread-poll.test.ts`

- [ ] **Step 1: persistence — import + type + parse.** In `src/lib/mark-chat/persistence.ts`:
- Add `MarkActionCard` and `parseActions` to the existing `@/domain` import (the file already imports `parseMedia`, `parseMentions`, `MarkMedia`, `MarkMention` from `@/domain`).
- Add to the `MarkMessage` type (after `feedback: "up" | "down" | null;`):
```typescript
  actions: MarkActionCard[];
```
- In `toMessage`, add after the `feedback:` mapping:
```typescript
    actions: parseActions((row.metadata as { actions?: unknown } | null)?.actions),
```

- [ ] **Step 2: poll equality.** In `src/app/mark/_components/use-thread-poll.ts`, in `sameMessages`, add an `actions.length` comparison to the per-message check (so a reply gaining cards re-renders). Change the `if (...)` condition to also include:
```typescript
      x.actions.length !== y.actions.length ||
```
(insert it alongside the existing `x.media.length !== y.media.length ||` line).

- [ ] **Step 3: fix `MarkMessage` literals.** Add `actions: [],` to every hand-built `MarkMessage` literal:
- `src/app/mark/_components/composer.tsx` — the `tempMessage` helper (after `feedback: null,` / `steps: [],`).
- `src/app/mark/_components/mark-chat.tsx` — the optimistic bubble in `handleRegenerate` (after `feedback: null,`).
- `src/app/mark/_components/use-thread-poll.test.ts` — the `msg()` base literal (after `feedback: null,` if present, else after `steps: []`).
Run `grep -rn "feedback: null" src/app/mark` to find them all.

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm vitest run src/app/mark src/lib/mark-chat`
Expected: PASS (no missing-property errors on `MarkMessage` literals; poll test still green).

- [ ] **Step 5: Commit**

```bash
git commit src/lib/mark-chat/persistence.ts src/app/mark/_components/use-thread-poll.ts src/app/mark/_components/composer.tsx src/app/mark/_components/mark-chat.tsx src/app/mark/_components/use-thread-poll.test.ts -m "feat(mark-chat): actions[] on MarkMessage + poll equality"
```

---

## Task 3: Chat-side campaign decision action

**Files:**
- Modify: `src/app/mark/actions.ts`

- [ ] **Step 1: import the decision lib.** Add near the other imports in `actions.ts`:
```typescript
import { type ApprovalDecision, decideAsset } from "@/lib/campaigns/decisions";
```

- [ ] **Step 2: append the action.**

```typescript
const CHAT_DECISIONS: ApprovalDecision[] = ["approved", "declined", "archived"];

/** Approve / decline / archive a draft asset straight from a Mark action card.
 *  Wraps the campaign decision lib (works gated or ungated). Outbound stays locked. */
export async function decideCampaignDraftAction(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const assetId = String(formData.get("assetId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  if (!assetId || !CHAT_DECISIONS.includes(decision as ApprovalDecision)) return;
  await decideAsset(
    { assetId, campaignId, decision: decision as ApprovalDecision, operator: getOperatorActor() },
  ).catch(() => undefined);
  revalidatePath("/mark");
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}
```

(`requireOperator`, `isSupabaseAdminConfigured`, `getOperatorActor`, `revalidatePath` are already imported.)

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit src/app/mark/actions.ts -m "feat(mark-chat): decideCampaignDraftAction for action-card approval"
```

---

## Task 4: `action-card.tsx` component

**Files:**
- Create: `src/app/mark/_components/action-card.tsx`

- [ ] **Step 1: Create the component.**

```tsx
"use client";

import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { MarkActionCard, MarkActionFlag } from "@/domain";

import { decideCampaignDraftAction } from "../actions";

function flagClass(tone: MarkActionFlag["tone"]): string {
  if (tone === "ok") return "text-[var(--ok-text)] bg-[var(--ok-soft)]";
  if (tone === "warn") return "text-[var(--warn-text)] bg-[var(--warn-soft)]";
  return "text-[var(--priority-text)] bg-[var(--priority-soft)]";
}

function LockNote() {
  return (
    <span className="ml-auto flex items-center gap-1 self-center text-[11px] text-[var(--text-muted)]">
      <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="9" width="10" height="7" rx="1.5" />
        <path d="M7 9V7a3 3 0 0 1 6 0v2" />
      </svg>
      outbound locked
    </span>
  );
}

export function ActionCard({ card }: { card: MarkActionCard }) {
  const isDraft = card.kind === "draft";
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-inset)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent-contrast)]" aria-hidden>
          {isDraft ? (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13.5V16h2.5l8-8L12 5.5l-8 8z" /></svg>
          ) : (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">{card.title}</span>
        {card.href ? (
          <Link href={card.href} className="shrink-0 text-xs font-semibold text-[var(--accent-contrast)] hover:underline">
            {isDraft ? "Open draft ▸" : "View ▸"}
          </Link>
        ) : null}
      </div>

      {card.preview ? (
        <p className="border-b border-[var(--border-hairline)] px-3 py-2.5 text-xs italic leading-relaxed text-[var(--text-secondary)]">
          {card.preview}
        </p>
      ) : null}

      {card.rows.length > 0 ? (
        <div className="flex flex-col">
          {card.rows.map((r, i) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{r.name}</span>
                {r.meta ? <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{r.meta}</span> : null}
                {r.badge ? <span className="shrink-0 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--on-accent)]">{r.badge}</span> : null}
              </>
            );
            const rowCls = "flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-3 py-2 last:border-b-0";
            return r.href ? (
              <Link key={`${i}-${r.name}`} href={r.href} className={cx(rowCls, "transition hover:bg-[var(--surface-raised)]")}>{inner}</Link>
            ) : (
              <div key={`${i}-${r.name}`} className={rowCls}>{inner}</div>
            );
          })}
        </div>
      ) : null}

      {card.flags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
          {card.flags.map((f, i) => (
            <span key={`${i}-${f.label}`} className={cx("rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", flagClass(f.tone))}>
              {f.label}
            </span>
          ))}
        </div>
      ) : null}

      {isDraft && card.approval ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] px-3 py-2.5">
          <form action={decideCampaignDraftAction}>
            <input type="hidden" name="assetId" value={card.approval.assetId} />
            <input type="hidden" name="campaignId" value={card.approval.campaignId} />
            <input type="hidden" name="decision" value="approved" />
            <button type="submit" className="rounded-md border border-[var(--ok-border)] bg-[var(--ok-solid)] px-3 py-1 text-xs font-bold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)]">
              Approve
            </button>
          </form>
          <Link
            href={`/campaigns/${card.approval.campaignId}`}
            className="rounded-md border border-[var(--warn-border)] px-3 py-1 text-xs font-bold text-[var(--warn-text)] transition hover:bg-[var(--warn-soft)]"
          >
            Request revision
          </Link>
          <form action={decideCampaignDraftAction}>
            <input type="hidden" name="assetId" value={card.approval.assetId} />
            <input type="hidden" name="campaignId" value={card.approval.campaignId} />
            <input type="hidden" name="decision" value="declined" />
            <button type="submit" className="rounded-md border border-[var(--border-hairline)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--priority-bright)] hover:text-[var(--priority-bright)]">
              Decline
            </button>
          </form>
          <LockNote />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify the CSS tokens exist.** Run: `grep -oE "\-\-(ok|warn|priority)-(text|soft|solid|hover|border)" src/app/globals.css | sort -u`. Confirm `--ok-text`, `--ok-soft`, `--ok-solid`, `--ok-hover`, `--ok-border`, `--on-ok`, `--warn-text`, `--warn-soft`, `--warn-border`, `--priority-text`, `--priority-soft`, `--priority-bright`, `--accent-soft`, `--accent-contrast`, `--on-accent`, `--accent` all exist. (They are used by `theme.ts` button/pill variants, so they exist — but verify; if any is missing, substitute the nearest existing token from `theme.ts`.)

- [ ] **Step 3: Verify build/lint**

Run: `pnpm lint`
Expected: PASS (component compiles; nothing imports it yet — that's fine, it's exported).

- [ ] **Step 4: Commit**

```bash
git add src/app/mark/_components/action-card.tsx
git commit src/app/mark/_components/action-card.tsx -m "feat(mark-chat): ActionCard component (result + draft w/ inline approval)"
```

---

## Task 5: Render action cards in the message list

**Files:**
- Modify: `src/app/mark/_components/message-list.tsx`

- [ ] **Step 1: import + render.** In `src/app/mark/_components/message-list.tsx`:
- Add: `import { ActionCard } from "./action-card";`
- In the Mark/system branch of `Message`, render cards for non-pending messages — add this directly BEFORE the `{!pending ? <References .../> : null}` line:
```tsx
        {!pending && message.actions.length > 0 ? (
          <div className="flex flex-col">
            {message.actions.map((card, i) => (
              <ActionCard key={`${i}-${card.title}`} card={card} />
            ))}
          </div>
        ) : null}
```

- [ ] **Step 2: Verify**

Run: `pnpm lint && pnpm vitest run src/app/mark`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git commit src/app/mark/_components/message-list.tsx -m "feat(mark-chat): render action cards in Mark replies"
```

---

## Task 6: Worker contract — `actions[]` schema

**Files:**
- Modify: `docs/mark-worker-contract-premium.md`

- [ ] **Step 1: Append a section** to `docs/mark-worker-contract-premium.md`:

```markdown
## 3. Action cards (`metadata.actions[]`)

Include an `actions` array on the reply `metadata` to render structured cards instead of
loose prose. Each entry:

```json
{
  "kind": "result" | "draft",
  "title": "3 leads added to CRM",
  "href": "/crm/leads",                       // optional "View ▸" / "Open draft ▸"
  "rows": [                                    // result rows (optional)
    { "name": "Dana Kasprak", "meta": "Emergency Homeowner", "badge": "92", "href": "/crm/leads/abc" }
  ],
  "preview": "When the unexpected hits…",      // draft preview text (optional)
  "flags": [ { "tone": "ok|warn|risk", "label": "On-brand" } ],   // optional
  "approval": { "kind": "campaign", "campaignId": "<id>", "assetId": "<id>" }  // draft only, optional
}
```

When a `draft` card carries `approval`, the operator gets inline **Approve / Decline**
(wired to the campaign decision flow) and a **Request revision** link to the campaign.
Malformed entries are dropped silently. Outbound stays locked regardless.
```

- [ ] **Step 2: Commit**

```bash
git commit docs/mark-worker-contract-premium.md -m "docs(mark-chat): action-card actions[] payload contract"
```

---

## Task 7: Final verification

- [ ] **Step 1:** `pnpm vitest run && pnpm lint` — all green (incl. new `mark-actions` tests).
- [ ] **Step 2:** `pnpm build` — exit 0.
- [ ] **Step 3: Manual** (`pnpm dev`): simulate a reply whose `metadata.actions` has a result card (rows render + View link) and a draft card with `approval` (preview + flags + Approve/Decline + Request-revision link; clicking Approve transitions the asset and the card's campaign — verify in `/campaigns`). With no `actions`, replies render exactly as before.
- [ ] **Step 4: Stop for review.**

---

## Self-Review

- **Spec coverage:** `MarkActionCard` + `parseActions` → Task 1. `actions` on `MarkMessage` + poll equality → Task 2. Draft approval wiring (`decideAsset`) → Task 3. `action-card.tsx` (result + draft + inline Approve/Decline + revision link) → Tasks 4–5. Worker `actions[]` contract → Task 6. Result cards' clickable rows + draft preview/flags → Task 4. ✓
- **Placeholder scan:** none — every code step is complete; manual-only items isolated to Task 7.
- **Type consistency:** `MarkActionCard`/`MarkActionRow`/`MarkActionFlag`/`MarkActionApproval`; `parseActions`; `MarkMessage.actions`; `decideCampaignDraftAction(formData)` reads `assetId`/`campaignId`/`decision` ↔ the card's hidden inputs; `decideAsset({assetId, campaignId, decision, operator})` matches the lib signature; `ActionCard({card})`. Consistent.
- **Decision note:** Request-revision is a *link* (the lib's `requestAssetRevision` needs a free-text instruction not suited to an inline card button) — intentional, matches the spec's "otherwise render only the href" fallback for the free-text case.
```
