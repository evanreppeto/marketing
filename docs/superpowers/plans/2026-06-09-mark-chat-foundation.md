# Mark Chat — Foundation Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the missing-projects-schema bug that breaks the Mark chat sidebar, then make every control work premium-grade (search, pin, rename, delete, copy, retry, stop, richer thinking state).

**Architecture:** One additive migration creates `mark_projects` + adds `project_id`/`pinned_at` to `mark_conversations`. New persistence helpers + server actions back pin/delete/cancel. The chat UI gains a shared `IconButton`, an extracted `useThreadPoll` hook, a `ThreadMenu` overflow popover, sidebar search, header inline-rename, a message hover toolbar, and a richer pending-reply state. Uploads/slash-commands/connections are deferred but get reserved UI slots.

**Tech Stack:** Next.js 16 (server actions, `proxy.ts`), React 19, TypeScript, Supabase (service-role), vitest, Tailwind v4 (CSS vars in `globals.css`), Signal design system (`DESIGN.md`).

**Spec:** `docs/superpowers/specs/2026-06-09-mark-chat-foundation-design.md`

---

## File map

- Create `supabase/migrations/20260609130000_mark_projects_and_pins.sql` — `mark_projects` table + `project_id`/`pinned_at` columns + indexes.
- Modify `src/lib/mark-chat/persistence.ts` — `pinnedAt` on `MarkConversation`/`ConversationRow`/`CONVERSATION_COLUMNS`/`toConversation`; pinned ordering in `listConversations`/`listArchivedConversations`; new `setConversationPinned`, `deleteConversation`, `cancelPendingMarkMessage`.
- Create `src/lib/mark-chat/persistence.test.ts` — tests for the new helpers + ordering.
- Modify `src/app/mark/actions.ts` — `renameThreadForm`, `pinThreadForm`, `unpinThreadForm`, `deleteThreadForm`, `renameProjectForm`, `cancelReplyAction`.
- Create `src/app/mark/_components/icon-button.tsx` — shared small icon button.
- Create `src/app/mark/_components/relative-time.ts` + `relative-time.test.ts` — pure `relativeTime(iso, nowMs)`.
- Create `src/app/mark/_components/use-thread-poll.ts` + `use-thread-poll.test.ts` — extracted polling hook + `sameMessages`.
- Create `src/app/mark/_components/thread-menu.tsx` — per-row `⋯` overflow popover.
- Modify `src/app/mark/_components/thread-sidebar.tsx` — search box, sections (Pinned/Project/Chats), relative timestamps, `ThreadMenu`.
- Modify `src/app/mark/_components/mark-chat.tsx` — header inline-rename + meta + `⋯` + connections slot; use `useThreadPoll`; pass retry/cancel callbacks.
- Modify `src/app/mark/_components/message-list.tsx` — hover toolbar (Copy/Retry), richer thinking state (breathe/shimmer/timeline line/elapsed/Stop), References cluster.
- Modify `src/app/mark/_components/composer.tsx` — expose programmatic send for Retry; reserve leading `+` slot.
- Modify `src/app/mark/_components/empty-state.tsx` — marketing-intent suggestion cards.
- Modify `src/app/globals.css` — `avatar-breathe` + `text-shimmer` keyframes + reduced-motion entries.

---

## Task 1: Migration — mark_projects + project_id + pinned_at

**Files:**
- Create: `supabase/migrations/20260609130000_mark_projects_and_pins.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Mark chat projects: group conversations, and pin conversations to the top.
-- The phase-1 projects code (src/lib/mark-chat/persistence.ts) already reads
-- mark_projects and mark_conversations.project_id, but no migration created them,
-- which breaks every conversation query. This adds them. Additive only.
-- Reuses the shared set_updated_at() trigger function from earlier migrations.

create table public.mark_projects (
  id uuid primary key default gen_random_uuid(),
  operator text not null default 'Operator' check (length(btrim(operator)) > 0),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index mark_projects_operator_idx on public.mark_projects(operator, created_at);

alter table public.mark_projects enable row level security;

create trigger mark_projects_set_updated_at
before update on public.mark_projects
for each row execute function public.set_updated_at();

-- Deleting a project orphans its chats (they fall back to "Chats"), never deletes them.
alter table public.mark_conversations
  add column project_id uuid references public.mark_projects(id) on delete set null;

-- Pin a conversation to the top of the list.
alter table public.mark_conversations
  add column pinned_at timestamptz;

create index mark_conversations_pin_idx
  on public.mark_conversations(operator, pinned_at desc nulls last, last_message_at desc);
```

- [ ] **Step 2: Verify the SQL parses (lint the repo, no DB needed)**

Run: `pnpm lint`
Expected: PASS (no TS touched; this confirms nothing else broke). The migration applies on the next `supabase db push` / environment migrate; we do not run it here.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260609130000_mark_projects_and_pins.sql
git commit -m "feat(mark-chat): add mark_projects + project_id/pinned_at migration"
```

---

## Task 2: Persistence — pinnedAt field, pinned ordering, new helpers (TDD)

**Files:**
- Modify: `src/lib/mark-chat/persistence.ts`
- Test: `src/lib/mark-chat/persistence.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/mark-chat/persistence.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import {
  cancelPendingMarkMessage,
  deleteConversation,
  listConversations,
  setConversationPinned,
} from "./persistence";

function calls(supabase: MockSupabase, method: string): Array<Record<string, unknown>> {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

function orderCalls(supabase: MockSupabase): Array<[string, ...unknown[]]> {
  return supabase.calls.filter(([m]) => m === "order");
}

describe("listConversations", () => {
  it("orders pinned first (nulls last), then by last_message_at desc", async () => {
    const supabase = createSupabaseQueryMock({ mark_conversations: { data: [], error: null } });

    await listConversations("Operator", supabase);

    const orders = orderCalls(supabase);
    expect(orders).toContainEqual(["order", "pinned_at", { ascending: false, nullsFirst: false }]);
    expect(orders).toContainEqual(["order", "last_message_at", { ascending: false }]);
  });

  it("maps pinned_at onto pinnedAt", async () => {
    const supabase = createSupabaseQueryMock({
      mark_conversations: {
        data: [
          {
            id: "c1",
            operator: "Operator",
            title: "Hi",
            status: "active",
            project_id: null,
            pinned_at: "2026-06-09T00:00:00Z",
            created_at: "t",
            updated_at: "t",
            last_message_at: "t",
          },
        ],
        error: null,
      },
    });

    const rows = await listConversations("Operator", supabase);

    expect(rows[0].pinnedAt).toBe("2026-06-09T00:00:00Z");
  });
});

describe("setConversationPinned", () => {
  it("stamps pinned_at when pinning", async () => {
    const supabase = createSupabaseQueryMock({ mark_conversations: { data: null, error: null } });

    await setConversationPinned("c1", true, supabase);

    const update = calls(supabase, "update")[0];
    expect(update.pinned_at).toEqual(expect.any(String));
  });

  it("clears pinned_at when unpinning", async () => {
    const supabase = createSupabaseQueryMock({ mark_conversations: { data: null, error: null } });

    await setConversationPinned("c1", false, supabase);

    const update = calls(supabase, "update")[0];
    expect(update.pinned_at).toBeNull();
  });
});

describe("deleteConversation", () => {
  it("hard-deletes the conversation row", async () => {
    const supabase = createSupabaseQueryMock({ mark_conversations: { data: null, error: null } });

    await deleteConversation("c1", supabase);

    expect(supabase.calls).toContainEqual(["delete"]);
    expect(supabase.calls).toContainEqual(["eq", "id", "c1"]);
  });
});

describe("cancelPendingMarkMessage", () => {
  it("deletes the latest pending mark message and reports true", async () => {
    const supabase = createSupabaseQueryMock({ mark_messages: { data: { id: "m9" }, error: null } });

    const cancelled = await cancelPendingMarkMessage("c1", supabase);

    expect(cancelled).toBe(true);
    expect(supabase.calls).toContainEqual(["eq", "status", "pending"]);
    expect(supabase.calls).toContainEqual(["delete"]);
  });

  it("is a safe no-op when no pending message exists", async () => {
    const supabase = createSupabaseQueryMock({ mark_messages: { data: null, error: null } });

    const cancelled = await cancelPendingMarkMessage("c1", supabase);

    expect(cancelled).toBe(false);
    expect(supabase.calls).not.toContainEqual(["delete"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/mark-chat/persistence.test.ts`
Expected: FAIL — `setConversationPinned`, `deleteConversation`, `cancelPendingMarkMessage` are not exported; ordering assertion fails.

- [ ] **Step 3: Add `pinnedAt` to the type + row + columns + mapper**

In `src/lib/mark-chat/persistence.ts`:

Add to `MarkConversation` (after `status: "active" | "archived";`):
```typescript
  pinnedAt: string | null;
```

Add to `ConversationRow` (after `status: "active" | "archived";`):
```typescript
  pinned_at: string | null;
```

Replace `CONVERSATION_COLUMNS`:
```typescript
const CONVERSATION_COLUMNS =
  "id, operator, title, status, project_id, pinned_at, created_at, updated_at, last_message_at";
```

In `toConversation`, add after `status: row.status,`:
```typescript
    pinnedAt: row.pinned_at ?? null,
```

- [ ] **Step 4: Update list ordering to float pinned to the top**

Replace the `.order(...)` line in `listConversations` (currently a single `.order("last_message_at", { ascending: false })`) with:
```typescript
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("last_message_at", { ascending: false });
```

Apply the same two `.order` lines in `listArchivedConversations` (replace its single `.order("last_message_at", { ascending: false })`).

- [ ] **Step 5: Add the new helpers**

Add after `assignConversationToProject` (near the projects/archive section):

```typescript
export async function setConversationPinned(
  id: string,
  pinned: boolean,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("mark_conversations")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", id);
  assertOk("mark_conversations pin", error);
}

export async function deleteConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  // mark_messages cascade via the conversation_id FK (on delete cascade).
  const { error } = await client.from("mark_conversations").delete().eq("id", id);
  assertOk("mark_conversations delete", error);
}

/** Deletes the latest pending Mark bubble for a conversation (the "stop generating"
 *  backing op). Returns false (safe no-op) when there's nothing pending. */
export async function cancelPendingMarkMessage(
  conversationId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("mark_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("role", "mark")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  assertOk("mark_messages cancel lookup", error);
  if (!data) return false;
  const { error: delErr } = await client.from("mark_messages").delete().eq("id", data.id);
  assertOk("mark_messages cancel delete", delErr);
  return true;
}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm vitest run src/lib/mark-chat/persistence.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Verify nothing else broke**

Run: `pnpm vitest run src/lib/mark-chat && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/mark-chat/persistence.ts src/lib/mark-chat/persistence.test.ts
git commit -m "feat(mark-chat): pinnedAt + pin/delete/cancel-pending persistence helpers"
```

---

## Task 3: Server actions — pin, delete, rename (form), cancel reply

**Files:**
- Modify: `src/app/mark/actions.ts`

- [ ] **Step 1: Extend the persistence import**

In `src/app/mark/actions.ts`, add these names to the existing `from "@/lib/mark-chat/persistence"` import block:
```typescript
  cancelPendingMarkMessage,
  deleteConversation,
  renameProject,
  setConversationPinned,
```

- [ ] **Step 2: Add the new actions**

Append to `src/app/mark/actions.ts`:

```typescript
export async function renameThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  const title = deriveThreadTitle(String(formData.get("title") ?? ""));
  if (!id) return;
  await renameConversation(id, title);
  revalidatePath("/mark");
}

export async function pinThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await setConversationPinned(id, true);
  revalidatePath("/mark");
}

export async function unpinThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await setConversationPinned(id, false);
  revalidatePath("/mark");
}

export async function deleteThreadForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return;
  await deleteConversation(id);
  revalidatePath("/mark");
}

export async function renameProjectForm(formData: FormData): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = String(formData.get("projectId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await renameProject(id, name);
  revalidatePath("/mark");
}

/** Best-effort "stop generating": drop the pending bubble so the thread settles.
 *  The client also stops polling optimistically; a late reply shows on next refresh. */
export async function cancelReplyAction(conversationId: string): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const id = conversationId.trim();
  if (!id) return;
  await cancelPendingMarkMessage(id).catch(() => undefined);
  revalidatePath("/mark");
}
```

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/mark/actions.ts
git commit -m "feat(mark-chat): pin/unpin/delete/rename-form + cancelReply server actions"
```

---

## Task 4: Shared IconButton

**Files:**
- Create: `src/app/mark/_components/icon-button.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cx } from "@/app/_components/theme";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required for icon-only buttons (a11y). */
  label: string;
  /** Visually emphasize as destructive on hover. */
  tone?: "default" | "danger";
};

/** Small square icon button shared by the message toolbar, header, and thread menu.
 *  Keeps focus-visible + hit-area consistent; backs onto theme tokens. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tone = "default", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]",
        tone === "danger"
          ? "hover:bg-[var(--priority-soft)] hover:text-[var(--priority-bright)]"
          : "hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
        className,
      )}
      {...rest}
    />
  );
});
```

- [ ] **Step 2: Verify**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/mark/_components/icon-button.tsx
git commit -m "feat(mark-chat): shared IconButton primitive"
```

---

## Task 5: relativeTime helper (TDD)

**Files:**
- Create: `src/app/mark/_components/relative-time.ts`
- Test: `src/app/mark/_components/relative-time.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";

import { relativeTime } from "./relative-time";

const NOW = Date.parse("2026-06-09T12:00:00Z");

describe("relativeTime", () => {
  it("shows 'now' under a minute", () => {
    expect(relativeTime("2026-06-09T11:59:30Z", NOW)).toBe("now");
  });
  it("shows minutes under an hour", () => {
    expect(relativeTime("2026-06-09T11:30:00Z", NOW)).toBe("30m");
  });
  it("shows hours under a day", () => {
    expect(relativeTime("2026-06-09T09:00:00Z", NOW)).toBe("3h");
  });
  it("shows a weekday under a week", () => {
    // 2026-06-07 is a Sunday.
    expect(relativeTime("2026-06-07T12:00:00Z", NOW)).toBe("Sun");
  });
  it("shows a short date beyond a week", () => {
    expect(relativeTime("2026-05-01T12:00:00Z", NOW)).toBe("May 1");
  });
  it("returns empty string for an unparseable value", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/mark/_components/relative-time.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Compact relative timestamp for chat rows: now / 30m / 3h / Sun / May 1.
 *  `nowMs` is injectable for deterministic tests; defaults to wall clock. */
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffMs = nowMs - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const d = new Date(then);
  if (days < 7) return DAY_NAMES[d.getUTCDay()];
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm vitest run src/app/mark/_components/relative-time.test.ts`
Expected: PASS (6 tests).

> Note: the test pins UTC by constructing dates from `Z` timestamps and reading `getUTCDay`/`getUTCDate`, so it passes regardless of the runner's timezone.

- [ ] **Step 5: Commit**

```bash
git add src/app/mark/_components/relative-time.ts src/app/mark/_components/relative-time.test.ts
git commit -m "feat(mark-chat): relativeTime helper for thread row timestamps"
```

---

## Task 6: Extract useThreadPoll hook (TDD on sameMessages)

**Files:**
- Create: `src/app/mark/_components/use-thread-poll.ts`
- Test: `src/app/mark/_components/use-thread-poll.test.ts`
- Modify: `src/app/mark/_components/mark-chat.tsx` (wire the hook — completed here, header work lands in Task 8)

- [ ] **Step 1: Write the failing test for `sameMessages`**

```typescript
import { describe, expect, it } from "vitest";

import { sameMessages } from "./use-thread-poll";
import type { MarkMessage } from "@/lib/mark-chat/persistence";

function msg(over: Partial<MarkMessage>): MarkMessage {
  return {
    id: "m1",
    conversationId: "c1",
    role: "mark",
    body: "",
    status: "pending",
    agentTaskId: null,
    mentions: [],
    media: [],
    steps: [],
    createdAt: "t",
    ...over,
  };
}

describe("sameMessages", () => {
  it("is true for identical lists", () => {
    expect(sameMessages([msg({})], [msg({})])).toBe(true);
  });
  it("is false on differing length", () => {
    expect(sameMessages([msg({})], [])).toBe(false);
  });
  it("is false when status changes", () => {
    expect(sameMessages([msg({ status: "pending" })], [msg({ status: "complete" })])).toBe(false);
  });
  it("is false when a step status changes", () => {
    const a = [msg({ steps: [{ label: "Searching", status: "running", at: "t" }] })];
    const b = [msg({ steps: [{ label: "Searching", status: "done", at: "t" }] })];
    expect(sameMessages(a, b)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/mark/_components/use-thread-poll.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook + exported `sameMessages`**

```typescript
"use client";

import { useEffect, useRef } from "react";

import type { MarkMessage } from "@/lib/mark-chat/persistence";

import { getThreadMessagesAction } from "../actions";

/** Cheap structural equality so an unchanged poll result doesn't trigger a
 *  re-render (and a forced auto-scroll) every tick. Compares status/body/media
 *  count and the live step list. */
export function sameMessages(a: MarkMessage[], b: MarkMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.body !== y.body ||
      x.media.length !== y.media.length ||
      x.steps.length !== y.steps.length ||
      x.steps.some((s, j) => s.status !== y.steps[j]?.status || s.label !== y.steps[j]?.label)
    ) {
      return false;
    }
  }
  return true;
}

/** Polls the active thread while a Mark reply is pending, updating `setMessages`
 *  only when something actually changed. ~10 min safety cap. */
export function useThreadPoll(
  activeId: string,
  messages: MarkMessage[],
  setMessages: (updater: (prev: MarkMessage[]) => MarkMessage[]) => void,
): void {
  const awaitingReply = messages.some((m) => m.role === "mark" && m.status === "pending");
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !awaitingReply) return;
    let cancelled = false;
    let polls = 0;
    const timer = setInterval(async () => {
      if (polls++ > 240) {
        clearInterval(timer); // ~10 min safety cap so we never poll forever
        return;
      }
      const fresh = await getThreadMessagesAction(activeIdRef.current);
      if (cancelled || activeIdRef.current !== activeId || fresh.length === 0) return;
      setMessages((prev) => (sameMessages(prev, fresh) ? prev : fresh));
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId, awaitingReply, setMessages]);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm vitest run src/app/mark/_components/use-thread-poll.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Use the hook in `mark-chat.tsx`, remove the inline polling**

In `src/app/mark/_components/mark-chat.tsx`:
- Delete the local `sameMessages` function (lines defining it near the top).
- Delete the `awaitingReply` const, the `activeIdRef` block, and the polling `useEffect` (the whole `useEffect(() => { if (!activeId || !awaitingReply) ... }, [activeId, awaitingReply])`).
- Replace the import of `getThreadMessagesAction` usage: remove `getThreadMessagesAction` from the `../actions` import (it's now used inside the hook), and add:
```typescript
import { useThreadPoll } from "./use-thread-poll";
```
- After the `const [draft, setDraft] = useState("");` line, add:
```typescript
  useThreadPoll(activeId, messages, setMessages);
```
- Keep the `useEffect` that re-seeds `setMessages(initialMessages)` on navigation.

- [ ] **Step 6: Verify**

Run: `pnpm lint && pnpm vitest run src/app/mark`
Expected: PASS. The chat still polls identically; the file is now thinner.

- [ ] **Step 7: Commit**

```bash
git add src/app/mark/_components/use-thread-poll.ts src/app/mark/_components/use-thread-poll.test.ts src/app/mark/_components/mark-chat.tsx
git commit -m "refactor(mark-chat): extract useThreadPoll hook + tested sameMessages"
```

---

## Task 7: ThreadMenu — per-row overflow popover

**Files:**
- Create: `src/app/mark/_components/thread-menu.tsx`

This menu replaces the always-visible `<select>`+archive controls on each row. It uses `<form>` actions (matching the existing fire-and-forget pattern) and closes on outside-click / Escape. Delete shows an inline confirm.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cx } from "@/app/_components/theme";
import type { MarkProject } from "@/lib/mark-chat/persistence";

import {
  archiveThreadForm,
  deleteThreadForm,
  moveConversationForm,
  pinThreadForm,
  unpinThreadForm,
} from "../actions";
import { IconButton } from "./icon-button";

function DotsIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
      <circle cx="4" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="16" cy="10" r="1.6" />
    </svg>
  );
}

export function ThreadMenu({
  conversationId,
  projectId,
  pinned,
  projects,
  isActive,
}: {
  conversationId: string;
  projectId: string | null;
  pinned: boolean;
  projects: MarkProject[];
  /** When true and the thread is deleted, navigate back to /mark. */
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDelete(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemCls =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]";

  return (
    <div ref={wrapRef} className="relative">
      <IconButton
        label="Thread options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <DotsIcon />
      </IconButton>

      {open ? (
        <div
          role="menu"
          className="msg-rise absolute right-0 top-8 z-20 w-52 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]"
        >
          {/* Pin / Unpin */}
          <form action={pinned ? unpinThreadForm : pinThreadForm}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <button type="submit" role="menuitem" className={itemCls}>
              {pinned ? "Unpin" : "Pin to top"}
            </button>
          </form>

          {/* Move to project */}
          <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Move to project
          </div>
          <form action={moveConversationForm}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <select
              name="projectId"
              defaultValue={projectId ?? ""}
              aria-label="Move chat to project"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 text-xs text-[var(--text-secondary)]"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </form>

          {/* Archive */}
          <form action={archiveThreadForm} className="mt-1">
            <input type="hidden" name="conversationId" value={conversationId} />
            <button type="submit" role="menuitem" className={itemCls}>
              Archive
            </button>
          </form>

          {/* Delete (inline confirm) */}
          {confirmDelete ? (
            <form
              action={deleteThreadForm}
              onSubmit={() => {
                if (isActive) router.push("/mark");
              }}
            >
              <input type="hidden" name="conversationId" value={conversationId} />
              <button
                type="submit"
                role="menuitem"
                className={cx(itemCls, "text-[var(--priority-bright)] hover:bg-[var(--priority-soft)]")}
              >
                Delete? Click to confirm
              </button>
            </form>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirmDelete(true)}
              className={cx(itemCls, "text-[var(--priority-bright)] hover:bg-[var(--priority-soft)]")}
            >
              Delete
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/mark/_components/thread-menu.tsx
git commit -m "feat(mark-chat): ThreadMenu overflow popover (pin/move/archive/delete)"
```

---

## Task 8: Sidebar — search, Pinned section, timestamps, ThreadMenu

**Files:**
- Modify: `src/app/mark/_components/thread-sidebar.tsx`

- [ ] **Step 1: Rewrite the sidebar**

Replace the entire contents of `src/app/mark/_components/thread-sidebar.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { MarkConversation, MarkProject } from "@/lib/mark-chat/persistence";

import { createProjectForm, unarchiveThreadForm } from "../actions";
import { relativeTime } from "./relative-time";
import { ThreadMenu } from "./thread-menu";

function NewChatLink() {
  return (
    <Link
      href="/mark"
      aria-label="Start a new chat with Mark"
      className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M10 4v12M4 10h12" />
      </svg>
      New chat
    </Link>
  );
}

function PinGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 shrink-0 text-[var(--accent)]" fill="currentColor">
      <path d="M12 2l1 5 3 2-4 1-1 6-1-6-4-1 3-2 1-5z" />
    </svg>
  );
}

function ChatRow({
  c,
  projects,
  activeId,
  nowMs,
}: {
  c: MarkConversation;
  projects: MarkProject[];
  activeId: string;
  nowMs: number;
}) {
  const active = c.id === activeId;
  return (
    <div className="group relative flex items-center gap-1">
      <Link
        href={`/mark?c=${c.id}`}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
          active
            ? "bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
        )}
        title={c.title}
      >
        {c.pinnedAt ? <PinGlyph /> : null}
        <span className="min-w-0 flex-1 truncate">{c.title}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)] group-hover:hidden">
          {relativeTime(c.lastMessageAt, nowMs)}
        </span>
      </Link>
      <div className="absolute right-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <ThreadMenu
          conversationId={c.id}
          projectId={c.projectId}
          pinned={Boolean(c.pinnedAt)}
          projects={projects}
          isActive={active}
        />
      </div>
    </div>
  );
}

export function ThreadSidebar({
  conversations,
  projects,
  archived,
  showArchived,
  activeId,
}: {
  conversations: MarkConversation[];
  projects: MarkProject[];
  archived: MarkConversation[];
  showArchived: boolean;
  activeId: string;
}) {
  const [query, setQuery] = useState("");
  // Stable "now" for the render pass; relativeTime is forgiving of staleness.
  const nowMs = useMemo(() => Date.now(), [conversations]);

  if (showArchived) {
    return (
      <aside className="hidden min-h-0 flex-col gap-2 overflow-y-auto p-3 lg:flex">
        <NewChatLink />
        <Link href="/mark" className="signal-eyebrow px-2 pt-2 hover:text-[var(--text-primary)]">
          ‹ Back to chats
        </Link>
        <p className="signal-eyebrow px-2 pt-1">Archived</p>
        <nav aria-label="Archived conversations" className="flex min-h-0 flex-col gap-0.5">
          {archived.length === 0 ? (
            <p className="px-2 py-3 text-xs text-[var(--text-muted)]">No archived chats.</p>
          ) : (
            archived.map((c) => (
              <div key={c.id} className="group flex items-center gap-1">
                <Link
                  href={`/mark?c=${c.id}`}
                  className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
                  title={c.title}
                >
                  {c.title}
                </Link>
                <form action={unarchiveThreadForm} className="shrink-0 pr-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <input type="hidden" name="conversationId" value={c.id} />
                  <button
                    type="submit"
                    title="Restore chat"
                    className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-inset)]"
                  >
                    Restore
                  </button>
                </form>
              </div>
            ))
          )}
        </nav>
      </aside>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;

  const pinned = filtered.filter((c) => c.pinnedAt);
  const unpinned = filtered.filter((c) => !c.pinnedAt);
  const unprojected = unpinned.filter((c) => !c.projectId);
  const byProject = new Map<string, MarkConversation[]>();
  for (const c of unpinned) {
    if (!c.projectId) continue;
    const list = byProject.get(c.projectId) ?? [];
    list.push(c);
    byProject.set(c.projectId, list);
  }

  return (
    <aside className="hidden min-h-0 flex-col gap-2 overflow-y-auto p-3 lg:flex">
      <NewChatLink />

      <label className="relative block px-1 pt-1">
        <span className="sr-only">Search chats</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
      </label>

      <form action={createProjectForm} className="flex items-center gap-1 px-1">
        <input
          name="name"
          placeholder="New project"
          aria-label="New project name"
          className="min-w-0 flex-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          aria-label="Create project"
          className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          +
        </button>
      </form>

      {pinned.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="signal-eyebrow px-2 pt-2">Pinned</p>
          {pinned.map((c) => (
            <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} nowMs={nowMs} />
          ))}
        </div>
      ) : null}

      {projects.map((project) => {
        const rows = byProject.get(project.id) ?? [];
        return (
          <div key={project.id} className="flex flex-col gap-0.5">
            <p className="signal-eyebrow px-2 pt-2">{project.name}</p>
            {rows.length === 0 ? (
              <p className="px-3 py-1 text-xs text-[var(--text-muted)]">No chats yet.</p>
            ) : (
              rows.map((c) => (
                <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} nowMs={nowMs} />
              ))
            )}
          </div>
        );
      })}

      <p className="signal-eyebrow px-2 pt-2">Chats</p>
      <nav aria-label="Conversations" className="flex min-h-0 flex-col gap-0.5">
        {unprojected.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[var(--text-muted)]">
            {q ? "No matches." : "No conversations yet. Say hello to Mark."}
          </p>
        ) : (
          unprojected.map((c) => (
            <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} nowMs={nowMs} />
          ))
        )}
      </nav>

      <Link
        href="/mark?archived=1"
        className="mt-1 px-2 py-2 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
      >
        Archived ›
      </Link>
    </aside>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm lint && pnpm vitest run src/app/mark`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/mark/_components/thread-sidebar.tsx
git commit -m "feat(mark-chat): sidebar search, Pinned section, row timestamps + ThreadMenu"
```

---

## Task 9: Header — inline rename, meta line, thread menu, connections slot

**Files:**
- Modify: `src/app/mark/_components/mark-chat.tsx`

After Task 6, the polling is already extracted. Now upgrade the header. We add an inline-rename `<h1>`, a muted meta line (project + message count), the active-thread `ThreadMenu`, and an empty reserved slot for the future connections indicator.

- [ ] **Step 1: Extend props + imports**

In `src/app/mark/_components/mark-chat.tsx`:
- Add to imports:
```typescript
import { useActionState } from "react";

import { renameThreadAction, type SimpleActionState } from "../actions";
import { ThreadMenu } from "./thread-menu";
import { IconButton } from "./icon-button";
```
(Merge `useActionState` into the existing `react` import line; keep the existing `useEffect/useRef/useState` imports.)

- Add two props to the `MarkChat({ ... })` destructure and its type — the header needs the active conversation's project + pin state:
```typescript
  activeProjectId,
  activePinned,
```
with types:
```typescript
  activeProjectId: string | null;
  activePinned: boolean;
```

- [ ] **Step 2: Add an inline-rename header sub-component**

Add this component above `export function MarkChat` in the same file:

```tsx
function HeaderTitle({
  activeId,
  activeTitle,
}: {
  activeId: string;
  activeTitle: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<SimpleActionState, FormData>(renameThreadAction, null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Close the editor once a rename succeeds.
  const lastOk = useRef(false);
  useEffect(() => {
    if (state?.ok && !lastOk.current) {
      lastOk.current = true;
      void Promise.resolve().then(() => setEditing(false));
    }
    if (!state?.ok) lastOk.current = false;
  }, [state]);

  if (!activeId) {
    return (
      <h1 className="truncate font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">
        New chat
      </h1>
    );
  }

  if (editing) {
    return (
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="conversationId" value={activeId} />
        <input
          ref={inputRef}
          name="title"
          defaultValue={activeTitle}
          aria-label="Rename thread"
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          className="min-w-0 flex-1 rounded-md border border-[var(--accent)] bg-[var(--surface-inset)] px-2 py-1 font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)] focus-visible:outline-none"
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Rename thread"
      className="group flex min-w-0 items-center gap-1.5 text-left"
    >
      <span className="truncate font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">
        {activeTitle || "New chat"}
      </span>
      <svg
        viewBox="0 0 20 20"
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 13.5V16h2.5l8-8L12 5.5l-8 8z" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 3: Replace the header markup**

Replace the existing `<header>...</header>` block in `MarkChat` with:

```tsx
      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="signal-eyebrow">Mark</p>
          <HeaderTitle activeId={activeId} activeTitle={activeTitle} />
          {activeId ? (
            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
              {(activeProjectId ? `${projects.find((p) => p.id === activeProjectId)?.name ?? "Project"} · ` : "") +
                `${messages.length} message${messages.length === 1 ? "" : "s"}`}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Reserved slot: future "what Mark can reach" connections indicator. */}
          {activeId ? (
            <ThreadMenu
              conversationId={activeId}
              projectId={activeProjectId}
              pinned={activePinned}
              projects={projects}
              isActive
            />
          ) : null}
          <Link
            href="/agent-operations"
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            Operations ▸
          </Link>
        </div>
      </header>
```

(`IconButton` is imported for use by `ThreadMenu`/future slot; if lint flags it as unused at this point, drop the `IconButton` import — it's already imported inside `thread-menu.tsx`.)

- [ ] **Step 4: Pass the new props from the page**

In `src/app/mark/page.tsx`, update the `<MarkChat .../>` props to include:
```tsx
      activeProjectId={activeConversation?.projectId ?? null}
      activePinned={Boolean(activeConversation?.pinnedAt)}
```

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm vitest run src/app/mark`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/mark/_components/mark-chat.tsx src/app/mark/page.tsx
git commit -m "feat(mark-chat): header inline-rename, meta line, thread menu + connections slot"
```

---

## Task 10: Composer — programmatic send for Retry + reserved attach slot

**Files:**
- Modify: `src/app/mark/_components/composer.tsx`

Retry (Task 11) needs to re-send the last operator message. The cleanest seam: let the parent set the draft and trigger a submit. We expose an imperative `submitNow()` via a ref-like callback prop, and reserve a leading `+` slot in the input row (disabled, titled "Attach (coming soon)") so uploads can land later without relayout.

- [ ] **Step 1: Add a `registerSubmit` prop and reserved attach button**

In `src/app/mark/_components/composer.tsx`:

- Add to the `Composer({ ... })` props + its type:
```typescript
  registerSubmit?: (fn: () => void) => void;
```

- Inside the component body, after `const formRef = useRef<HTMLFormElement>(null);`, add:
```typescript
  // Let the parent trigger a send (used by Retry). Submits the current draft.
  useEffect(() => {
    registerSubmit?.(() => {
      if (!draft.trim()) return;
      formRef.current?.requestSubmit();
    });
  }, [registerSubmit, draft]);
```

- In the input row `<div className="flex items-end gap-2">`, add this reserved attach button as the FIRST child (before the `<textarea>`):
```tsx
            <button
              type="button"
              disabled
              aria-label="Attach a file (coming soon)"
              title="Attach a file (coming soon)"
              className="flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-full text-[var(--text-muted)] opacity-50"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 4v12M3 10h12" transform="rotate(45 10 10)" />
              </svg>
            </button>
```

- [ ] **Step 2: Verify**

Run: `pnpm lint && pnpm vitest run src/app/mark`
Expected: PASS. The composer renders a disabled `+` affordance and exposes `registerSubmit`.

- [ ] **Step 3: Commit**

```bash
git add src/app/mark/_components/composer.tsx
git commit -m "feat(mark-chat): composer exposes programmatic send + reserved attach slot"
```

---

## Task 11: Message list — hover toolbar (Copy/Retry), richer thinking, References

**Files:**
- Modify: `src/app/mark/_components/message-list.tsx`
- Modify: `src/app/mark/_components/mark-chat.tsx` (pass `onRetry` + `onStop` down)

- [ ] **Step 1: Add `onRetry`/`onStop` plumbing in `mark-chat.tsx`**

In `MarkChat`, add state to hold the composer's submit fn and the last operator message:
```typescript
  const submitFnRef = useRef<(() => void) | null>(null);
```
Pass `registerSubmit={(fn) => { submitFnRef.current = fn; }}` to `<Composer .../>`.

Define handlers above the return:
```typescript
  function handleRetry() {
    const lastOperator = [...messages].reverse().find((m) => m.role === "operator");
    if (!lastOperator) return;
    setDraft(lastOperator.body);
    // Defer so the hidden inputs pick up the new draft before submit.
    requestAnimationFrame(() => submitFnRef.current?.());
  }

  async function handleStop() {
    setMessages((prev) => prev.filter((m) => !(m.role === "mark" && m.status === "pending")));
    await cancelReplyAction(activeId);
  }
```
Add `cancelReplyAction` to the `../actions` import.

Pass both to `<MessageList .../>`:
```tsx
          {hasMessages ? (
            <MessageList messages={messages} onRetry={handleRetry} onStop={handleStop} />
          ) : (
            <ChatEmptyState onPick={pickSuggestion} />
          )}
```

- [ ] **Step 2: Update `MessageList` to accept + thread the callbacks**

In `message-list.tsx`, change the `MessageList` signature:
```tsx
export function MessageList({
  messages,
  onRetry,
  onStop,
}: {
  messages: MarkMessage[];
  onRetry: () => void;
  onStop: () => void;
}) {
```
and pass to each `<Message>`: `<Message message={m} onRetry={onRetry} onStop={onStop} />`.

Update the `Message` signature to `{ message, onRetry, onStop }: { message: MarkMessage; onRetry: () => void; onStop: () => void }`.

- [ ] **Step 3: Add a CopyButton + Toolbar**

Add near the top of `message-list.tsx` (after imports):

```tsx
import { useEffect, useRef, useState } from "react";
// ^ ensure useState is imported alongside the existing useEffect/useRef.

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — ignore */
        }
      }}
      className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
```

- [ ] **Step 4: Add an elapsed-time hook + richer pending state**

Add this small hook (after `CopyButton`):

```tsx
function useElapsed(active: boolean): string {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const t = setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [active]);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
```

Replace `MarkAvatar` so it can breathe while pending:
```tsx
function MarkAvatar({ pending }: { pending?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] font-display text-xs font-black text-[var(--on-accent)]",
        pending ? "motion-safe:[animation:avatar-breathe_1.8s_ease-in-out_infinite]" : "",
      )}
    >
      M
    </span>
  );
}
```

Replace `ThinkingIndicator` with a shimmer line + a stop control container. Define a new `PendingBlock`:

```tsx
function PendingBlock({ steps, onStop }: { steps: MarkStep[]; onStop: () => void }) {
  const elapsed = useElapsed(true);
  return (
    <div className="flex flex-col gap-2">
      {steps.length > 0 ? (
        <div className="relative flex flex-col gap-1.5 border-l border-[var(--border-hairline)] pl-3" aria-label="What Mark is doing">
          {steps.map((s, i) => (
            <StepRow key={`${i}-${s.label}`} step={s} />
          ))}
        </div>
      ) : (
        <span className="mark-shimmer text-sm font-medium">Mark is thinking…</span>
      )}
      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span className="tabular-nums">{elapsed}</span>
        <button
          type="button"
          onClick={onStop}
          className="rounded-md border border-[var(--border-hairline)] px-2 py-0.5 font-semibold transition hover:border-[var(--priority-bright)] hover:text-[var(--priority-bright)]"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
```

(Keep `StepRow`; you may delete the now-unused `ThinkingIndicator` and `ActivityTimeline`, or leave `ActivityTimeline` if other code imports it — it does not, so delete both to avoid lint "unused" errors.)

- [ ] **Step 5: Add a References cluster + wire the toolbar into `Message`**

Add a `References` component:
```tsx
function References({ mentions }: { mentions: MarkMessage["mentions"] }) {
  if (mentions.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="signal-eyebrow mb-1.5">References</p>
      <div className="flex flex-wrap gap-1.5">
        {mentions.map((m) => (
          <Link
            key={`${m.type}:${m.id}`}
            href={m.href}
            className="inline-flex items-center rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-raised)]"
          >
            @{m.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

Rewrite the Mark/system branch of `Message` to use `PendingBlock`, the hover toolbar (Copy on complete, Retry on failed), and `References` (replacing the loose `MentionChips` for Mark replies):

```tsx
  // Mark / system: full-width, avatar + plain text.
  const pending = message.status === "pending";
  const failed = message.status === "failed";
  return (
    <div className="group flex gap-3">
      <MarkAvatar pending={pending} />
      <div className="min-w-0 flex-1 pt-0.5">
        {pending ? (
          <PendingBlock steps={message.steps} onStop={onStop} />
        ) : (
          <div
            className={cx(
              "whitespace-pre-wrap text-sm leading-7",
              failed ? "text-[var(--priority-bright)]" : "text-[var(--text-primary)]",
            )}
          >
            {message.body}
          </div>
        )}
        {!pending && message.steps.length > 0 ? <StepTrace steps={message.steps} /> : null}
        {!pending ? <References mentions={message.mentions} /> : null}
        {message.media.length > 0 ? <MessageMedia media={message.media} /> : null}
        {!pending ? (
          <div className="mt-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            {failed ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-inset)]"
              >
                Retry
              </button>
            ) : (
              <CopyButton text={message.body} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
```

Keep the operator branch as-is (it still uses `MentionChips`). `MentionChips` stays for the operator path.

- [ ] **Step 6: Verify**

Run: `pnpm lint && pnpm vitest run src/app/mark`
Expected: PASS. (If lint flags `MentionChips` as unused, it isn't — the operator branch still calls it. If it flags `ActivityTimeline`/`ThinkingIndicator` unused, delete those two functions.)

- [ ] **Step 7: Commit**

```bash
git add src/app/mark/_components/message-list.tsx src/app/mark/_components/mark-chat.tsx
git commit -m "feat(mark-chat): message toolbar (copy/retry), richer thinking state, References cluster"
```

---

## Task 12: Motion keyframes (avatar-breathe + text-shimmer)

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the keyframes + shimmer class**

In `src/app/globals.css`, just after the `.lightbox-panel { ... }` line (around line 353, end of the "Mark chat motion" block), add:

```css
@keyframes avatar-breathe {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: 0.82; }
}
@keyframes text-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.mark-shimmer {
  background: linear-gradient(
    90deg,
    var(--text-muted) 0%,
    var(--text-primary) 50%,
    var(--text-muted) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: text-shimmer 2.2s linear infinite;
}
```

- [ ] **Step 2: Respect reduced-motion**

In the `@media (prefers-reduced-motion: reduce)` block (around line 430), add `.mark-shimmer` to the list of selectors set to `animation: none;`, and give it a solid color so the text stays visible:

```css
@media (prefers-reduced-motion: reduce) {
  .module-rise,
  .status-breathe,
  .status-ripple,
  .bar-fill,
  .msg-rise,
  .media-rise,
  .lightbox-backdrop,
  .lightbox-panel,
  .mark-shimmer {
    animation: none;
  }

  .mark-shimmer {
    background: none;
    -webkit-background-clip: border-box;
    background-clip: border-box;
    color: var(--text-secondary);
  }

  .signal-radar::after {
    animation: none;
    opacity: 0;
  }
}
```

(The `avatar-breathe` animation is applied via `motion-safe:` in the component, so it's already disabled under reduced-motion automatically — no entry needed here.)

- [ ] **Step 3: Verify**

Run: `pnpm lint`
Expected: PASS. Manually confirm the dev server compiles CSS without errors (`pnpm dev`, load `/mark`).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(mark-chat): avatar-breathe + text-shimmer keyframes (reduced-motion safe)"
```

---

## Task 13: Refresh empty-state suggestions

**Files:**
- Modify: `src/app/mark/_components/empty-state.tsx`

- [ ] **Step 1: Replace the `SUGGESTIONS` array**

```tsx
const SUGGESTIONS = [
  {
    title: "Find new leads for a persona",
    hint: "Mark searches and proposes who to add",
    prompt: "Find new leads for @",
  },
  {
    title: "What needs my approval?",
    hint: "Everything waiting on a decision",
    prompt: "What's awaiting my approval right now, and what's the risk on each?",
  },
  {
    title: "Draft a campaign for a persona",
    hint: "Mark drafts; outbound stays locked",
    prompt: "Draft a campaign for @",
  },
  {
    title: "Which leads are hottest right now?",
    hint: "Ranked by score and recent activity",
    prompt: "Which leads are hottest right now? Rank them by score and recent activity.",
  },
];
```

- [ ] **Step 2: Verify**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/mark/_components/empty-state.tsx
git commit -m "feat(mark-chat): marketing-intent empty-state suggestions"
```

---

## Task 14: Final verification

- [ ] **Step 1: Full test + lint sweep**

Run: `pnpm vitest run && pnpm lint`
Expected: PASS (all suites, including the new `persistence.test.ts`, `relative-time.test.ts`, `use-thread-poll.test.ts`).

- [ ] **Step 2: Build check**

Run: `pnpm build`
Expected: Compiles clean (no type errors across the touched files).

- [ ] **Step 3: Manual verification checklist (run `pnpm dev`, Supabase configured, migration applied)**

Confirm each, since much of this is UI behavior the tests don't cover:
- [ ] Sidebar loads with no error (the schema fix works — `project_id`/`pinned_at` selected).
- [ ] Create a project; move a chat into it via the `⋯` menu; it appears under the project heading.
- [ ] Pin a chat → it floats to a "Pinned" section at the top with a pin glyph; unpin returns it.
- [ ] Search box filters chats by title instantly.
- [ ] Rename from the header (click title, Enter saves, Esc cancels) and from the `⋯` menu (none — header only; menu has pin/move/archive/delete) — header rename persists.
- [ ] Archive from the menu → moves to Archived; Restore brings it back.
- [ ] Delete from the menu → inline "Delete? Click to confirm" → row gone; if it was the active thread, you land on `/mark`.
- [ ] Send a message: pending bubble shows the breathing avatar + "Mark is thinking…" shimmer; with steps, the timeline shows the connective line + elapsed timer + Stop.
- [ ] Stop removes the pending bubble and settles the thread.
- [ ] Copy on a Mark reply shows "Copied" for ~1.5s.
- [ ] A failed reply shows Retry; clicking re-sends the last message.
- [ ] A reply carrying mentions shows a "References" cluster of clickable record chips.
- [ ] `prefers-reduced-motion` (OS setting) disables the shimmer/breathe but text stays readable.

- [ ] **Step 4: Commit any final fixups, then stop for review.**

---

## Self-Review

- **Spec coverage:**
  - Migration / schema fix → Task 1. ✓
  - `pinnedAt`, ordering, `setConversationPinned`/`deleteConversation`/`cancelPendingMarkMessage` → Task 2. ✓
  - Server actions (rename form, pin/unpin, delete, rename project, cancelReply) → Task 3. ✓
  - `icon-button.tsx` → Task 4; `relative-time` → Task 5; `useThreadPoll` → Task 6; `thread-menu.tsx` → Task 7. ✓
  - Sidebar (search, Pinned, project sections, timestamps, menu) → Task 8. ✓
  - Header (inline rename, meta, menu, connections slot) → Task 9. ✓
  - Composer (programmatic send + reserved attach slot) → Task 10. ✓
  - Message list (Copy/Retry toolbar, richer thinking w/ breathe/shimmer/timeline-line/elapsed/Stop, References) → Task 11. ✓
  - Motion keyframes (reduced-motion safe) → Task 12. ✓
  - Empty-state refresh → Task 13. ✓
  - Deferred uploads/slash/connections: reserved slots only (composer `+`, header slot) — no backend, per spec non-goals. ✓
- **Placeholder scan:** none — every code step has complete code; manual-only UI steps are explicitly the verification checklist (Task 14), not implementation gaps.
- **Type consistency:** `MarkConversation.pinnedAt`, `pinned_at` row/column, `setConversationPinned(id, boolean)`, `deleteConversation(id)`, `cancelPendingMarkMessage(id) -> boolean`, `cancelReplyAction(conversationId)`, `useThreadPoll(activeId, messages, setMessages)`, `sameMessages`, `relativeTime(iso, nowMs)`, `ThreadMenu` props (`conversationId/projectId/pinned/projects/isActive`), `MessageList`/`Message` `onRetry`/`onStop`, `Composer.registerSubmit` — all referenced consistently across tasks.
- **Ordering note:** Task 6 must land before Task 9 (header) and Task 11 (which both edit `mark-chat.tsx`) so the polling extraction doesn't conflict; Tasks are already in that order.
```
