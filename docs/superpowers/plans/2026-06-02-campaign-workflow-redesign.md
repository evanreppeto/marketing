# Campaign Workflow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split campaign approvals into three homes — a risk-gated "Needs your approval" inbox on Today, the already-existing decide-in-context banner in the campaign workspace, and a read-only Activity ledger (`/approvals`) plus a bearer-gated history API Mark can query — and ship a fully-populated seeded test campaign.

**Architecture:** Reuse the existing decision engine (`decideApprovalItem` in `src/lib/campaigns/decisions.ts`) for inbox quick-approve. Add an append-only `undoDecision` (requires one additive enum value). Add a read-model `listApprovalHistory` sourced from `approval_decisions`, expose it as `GET /api/v1/approvals/history`, and rewrite `/approvals` from an action queue into a read-only ledger. A new seed script mirrors `scripts/seed-hermes-demo.mjs`.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), React 19 (`useActionState`), Supabase (`@supabase/supabase-js` admin client), Vitest, pnpm. Path alias `@/*` → `./src/*`.

---

## Already-satisfied spec items (do NOT rebuild)

- **Spec §2 "decide in context"** is already implemented: `src/app/campaigns/_components/campaign-workspace.tsx:58-68` renders a workspace-level pending-approval banner with `<DecisionControls>` above the tabs, shown regardless of active tab, plus the existing `ApprovalsTab`. No new Overview-tab banner is needed. Task 8 only adjusts the gallery badge.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20260602120000_approval_decision_reverted.sql` (new) | Add `'reverted'` to `approval_decision_kind` enum | 1 |
| `src/lib/campaigns/decisions.ts` (modify) | Add `undoDecision()` append-only reversal | 2 |
| `src/lib/campaigns/__tests__/decisions.test.ts` (new) | Unit test `undoDecision` with a fake client | 2 |
| `src/lib/approvals/read-model.ts` (modify) | Add `listApprovalHistory()` | 3 |
| `src/lib/approvals/__tests__/history.test.ts` (new) | Unit test `listApprovalHistory` shaping/filtering | 3 |
| `src/app/api/v1/approvals/history/route.ts` (new) | Bearer-gated GET history endpoint | 4 |
| `src/app/api/v1/approvals/history/route.test.ts` (new) | Route auth tests (401/503) | 4 |
| `src/app/_data/inbox-actions.ts` (new) | `"use server"` inbox approve/decline/undo actions | 5 |
| `src/app/_components/approval-inbox.tsx` (new) | Client inbox list: risk-gated buttons + undo toast | 6 |
| `src/app/page.tsx` (modify) | Render `<ApprovalInbox>` in place of the approval bucket | 6 |
| `src/app/approvals/page.tsx` (rewrite) | Read-only Activity ledger | 7 |
| `src/app/_data/growth-engine.ts` (modify) | Nav label "Approvals" → "Activity" | 7 |
| `src/app/campaigns/_components/campaign-gallery.tsx` (modify) | Pending badge on cards | 8 |
| `scripts/seed-test-campaign.mjs` (new) | Fully-filled test campaign seed | 9 |
| `package.json` (modify) | `seed:test-campaign` script | 9 |

Convention reminders: `requireOperator()` then `isSupabaseAdminConfigured()` guard in every server action; read-model functions take an injectable `client: SupabaseClient = getSupabaseAdminClient()` last param (matches `listApprovalCards`); API routes use `checkBearerToken(request, "HERMES_AGENT_API_TOKEN")` and return `503 not_configured` / `401 unauthorized`.

---

### Task 1: Migration — add `'reverted'` decision kind

**Files:**
- Create: `supabase/migrations/20260602120000_approval_decision_reverted.sql`

Append-only undo records a reversal row in `approval_decisions`. The `approval_decision_kind` enum currently lacks a reversal value (`approved|declined|revision_requested|archived|blocked`), so we add one. `ALTER TYPE ... ADD VALUE` is additive and safe; it must run outside a transaction, so this migration contains only that statement.

- [ ] **Step 1: Write the migration**

```sql
-- Add a reversal kind so "undo" can be recorded append-only in approval_decisions
-- instead of deleting history. Additive enum change; safe and backward-compatible.
alter type public.approval_decision_kind add value if not exists 'reverted';
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm supabase db push` (or apply via your migration workflow / Supabase MCP `apply_migration`).
Expected: migration applies cleanly; `select enum_range(null::public.approval_decision_kind);` now includes `reverted`.

If you cannot apply migrations in this environment, note it and continue — Task 2's unit test uses a fake client and does not require the live enum.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260602120000_approval_decision_reverted.sql
git commit -m "feat(db): add 'reverted' approval_decision_kind for append-only undo"
```

---

### Task 2: `undoDecision()` in the decision engine

**Files:**
- Modify: `src/lib/campaigns/decisions.ts`
- Test: `src/lib/campaigns/__tests__/decisions.test.ts`

`undoDecision` reverses the most recent decision on an approval item: it restores the item (and linked asset/campaign) to the decision's `previous_status`, and records an append-only `approval_decisions` row with `decision: 'reverted'`. It refuses if the last decision was already a reversal.

- [ ] **Step 1: Write the failing test**

Create `src/lib/campaigns/__tests__/decisions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { undoDecision } from "../decisions";

/**
 * Minimal awaitable Supabase stub. Each `.from(table)` returns a builder whose
 * chain methods return `this`; terminal `.maybeSingle()`/`.single()` resolve to
 * `{ data, error }`. Inserts/updates are recorded for assertions.
 */
function makeClient(config: {
  lastDecision: Record<string, unknown> | null;
  item: Record<string, unknown> | null;
}) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  function builder(table: string) {
    const state: { op: string; payload?: unknown } = { op: "select" };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      order: () => api,
      limit: () => api,
      insert: (payload: unknown) => {
        state.op = "insert";
        state.payload = payload;
        calls.push({ table, op: "insert", payload });
        return api;
      },
      update: (payload: unknown) => {
        state.op = "update";
        state.payload = payload;
        calls.push({ table, op: "update", payload });
        return api;
      },
      maybeSingle: async () => {
        if (table === "approval_decisions") return { data: config.lastDecision, error: null };
        if (table === "approval_items") return { data: config.item, error: null };
        return { data: null, error: null };
      },
      single: async () => ({ data: { id: "x" }, error: null }),
      then: (resolve: (v: { data: null; error: null }) => unknown) => resolve({ data: null, error: null }),
    };
    return api;
  }

  return {
    client: { from: (table: string) => builder(table) } as never,
    calls,
  };
}

describe("undoDecision", () => {
  it("restores the item to previous_status and records a 'reverted' decision", async () => {
    const { client, calls } = makeClient({
      lastDecision: { id: "d1", decision: "approved", previous_status: "pending_approval", next_status: "approved" },
      item: { id: "i1", status: "approved", campaign_id: "c1", campaign_asset_id: "a1" },
    });

    const result = await undoDecision({ approvalItemId: "i1", operator: "Evan" }, client);

    expect(result.restoredStatus).toBe("pending_approval");

    const decisionInsert = calls.find((c) => c.table === "approval_decisions" && c.op === "insert");
    expect(decisionInsert?.payload).toMatchObject({ decision: "reverted", next_status: "pending_approval", previous_status: "approved" });

    const itemUpdate = calls.find((c) => c.table === "approval_items" && c.op === "update");
    expect(itemUpdate?.payload).toMatchObject({ status: "pending_approval" });
  });

  it("refuses when the last decision was already a reversal", async () => {
    const { client } = makeClient({
      lastDecision: { id: "d2", decision: "reverted", previous_status: "approved", next_status: "pending_approval" },
      item: { id: "i1", status: "pending_approval", campaign_id: "c1", campaign_asset_id: null },
    });

    await expect(undoDecision({ approvalItemId: "i1", operator: "Evan" }, client)).rejects.toThrow(/already/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/campaigns/__tests__/decisions.test.ts`
Expected: FAIL — `undoDecision` is not exported.

- [ ] **Step 3: Implement `undoDecision`**

Append to `src/lib/campaigns/decisions.ts` (after `decideApprovalItem`, before `assertOk`):

```typescript
export type UndoDecisionInput = {
  approvalItemId: string;
  operator: string;
};

/**
 * Append-only reversal of the most recent decision on an approval item. Restores
 * the item (and any linked asset/campaign) to the decision's previous_status and
 * records a `reverted` approval_decisions row. Never deletes history; never
 * unlocks outbound. Throws if there is nothing to undo or the last decision was
 * already a reversal.
 */
export async function undoDecision(
  input: UndoDecisionInput,
  client: SupabaseClient = getSupabaseAdminClient(),
) {
  const { approvalItemId, operator } = input;
  const now = new Date().toISOString();

  const { data: last, error: lastError } = await client
    .from("approval_decisions")
    .select("id,decision,previous_status,next_status")
    .eq("approval_item_id", approvalItemId)
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; decision: string; previous_status: string | null; next_status: string }>();
  assertOk("approval_decisions lookup", lastError);
  if (!last) {
    throw new Error("No decision to undo for this approval item.");
  }
  if (last.decision === "reverted") {
    throw new Error("The last action was already an undo; nothing to revert.");
  }

  const restoredStatus = last.previous_status ?? "pending_approval";

  const { data: item, error: itemError } = await client
    .from("approval_items")
    .select("id,status,campaign_id,campaign_asset_id")
    .eq("id", approvalItemId)
    .maybeSingle<{ id: string; status: string; campaign_id: string | null; campaign_asset_id: string | null }>();
  assertOk("approval_items lookup", itemError);
  if (!item) {
    throw new Error("Approval item not found.");
  }

  const { error: decisionError } = await client.from("approval_decisions").insert({
    approval_item_id: approvalItemId,
    decision: "reverted",
    decided_by: operator,
    previous_status: last.next_status,
    next_status: restoredStatus,
    metadata: { source: "approval_inbox_undo", reverted_decision_id: last.id, outbound_locked: true },
  });
  assertOk("approval_decisions insert (revert)", decisionError);

  const { error: updateItemError } = await client
    .from("approval_items")
    .update({ status: restoredStatus, reviewed_by: null, reviewed_at: null })
    .eq("id", approvalItemId);
  assertOk("approval_items update (revert)", updateItemError);

  if (item.campaign_asset_id) {
    const { error: assetError } = await client
      .from("campaign_assets")
      .update({ status: restoredStatus, approved_by: null, approved_at: null })
      .eq("id", item.campaign_asset_id);
    assertOk("campaign_assets update (revert)", assetError);
  }

  if (item.campaign_id) {
    const { error: campaignError } = await client.from("campaigns").update({ status: restoredStatus }).eq("id", item.campaign_id);
    assertOk("campaigns update (revert)", campaignError);

    const { error: eventError } = await client.from("campaign_events").insert({
      campaign_id: item.campaign_id,
      campaign_asset_id: item.campaign_asset_id,
      approval_item_id: approvalItemId,
      event_type: "decision_reverted",
      actor: operator,
      detail: `Decision undone by ${operator}; restored to ${restoredStatus}.`,
      payload: { reverted_decision_id: last.id, outbound_locked: true },
    });
    assertOk("campaign_events insert (revert)", eventError);
  }

  return { approvalItemId, restoredStatus };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/campaigns/__tests__/decisions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/decisions.ts src/lib/campaigns/__tests__/decisions.test.ts
git commit -m "feat(campaigns): append-only undoDecision for reversing approvals"
```

---

### Task 3: `listApprovalHistory()` read-model

**Files:**
- Modify: `src/lib/approvals/read-model.ts`
- Test: `src/lib/approvals/__tests__/history.test.ts`

Returns decisions newest-first for the Activity ledger and history API. Uses the same two-step "fetch then index-by-id" pattern as `listApprovalCards` (no PostgREST embedding) so it stays easy to test with a fake client.

- [ ] **Step 1: Write the failing test**

Create `src/lib/approvals/__tests__/history.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { listApprovalHistory } from "../read-model";

/**
 * Fake Supabase client returning canned rows per table. Builder methods return
 * `this`; the builder is awaitable (`then`) resolving to `{ data, error }`, which
 * is how the read-model consumes list queries.
 */
function makeClient(tables: Record<string, unknown[]>) {
  function builder(table: string) {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      in: () => api,
      order: () => api,
      limit: () => api,
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: tables[table] ?? [], error: null }),
    };
    return api;
  }
  return { from: (table: string) => builder(table) } as never;
}

describe("listApprovalHistory", () => {
  it("maps decisions newest-first with item + campaign context", async () => {
    const client = makeClient({
      approval_decisions: [
        { id: "d1", approval_item_id: "i1", decision: "approved", decided_by: "Evan", decided_at: "2026-05-28T15:04:00Z", decision_notes: "ok", previous_status: "pending_approval", next_status: "approved" },
      ],
      approval_items: [{ id: "i1", item_type: "email_campaign_asset", risk_level: "medium", campaign_id: "c1" }],
      campaigns: [{ id: "c1", name: "Spring Flood Recovery" }],
    });

    const rows = await listApprovalHistory({ limit: 10 }, client);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      decision: "approved",
      decidedBy: "Evan",
      itemType: "email_campaign_asset",
      riskLevel: "medium",
      campaignId: "c1",
      campaignName: "Spring Flood Recovery",
    });
  });

  it("returns an empty array when there are no decisions", async () => {
    const client = makeClient({ approval_decisions: [], approval_items: [], campaigns: [] });
    const rows = await listApprovalHistory({}, client);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/approvals/__tests__/history.test.ts`
Expected: FAIL — `listApprovalHistory` is not exported.

- [ ] **Step 3: Implement the read-model function**

At the top of `src/lib/approvals/read-model.ts`, confirm these imports exist (add only what's missing):

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
```

Append to `src/lib/approvals/read-model.ts`:

```typescript
export type ApprovalHistoryEntry = {
  id: string;
  approvalItemId: string;
  itemType: string;
  decision: string;
  decidedBy: string;
  decidedAt: string;
  decisionNotes: string | null;
  previousStatus: string | null;
  nextStatus: string;
  campaignId: string | null;
  campaignName: string | null;
  riskLevel: string | null;
};

export type ApprovalHistoryFilter = {
  campaignId?: string;
  limit?: number;
};

/**
 * Read-only ledger of approval decisions, newest first. Powers the Activity page
 * and GET /api/v1/approvals/history. Two-step fetch (decisions -> items ->
 * campaigns) indexed by id, mirroring listApprovalCards; no outbound side effects.
 */
export async function listApprovalHistory(
  filter: ApprovalHistoryFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ApprovalHistoryEntry[]> {
  const limit = filter.limit ?? 100;

  // When filtering by campaign, resolve that campaign's item ids first.
  let itemIdFilter: string[] | null = null;
  if (filter.campaignId) {
    const { data: campaignItems, error: campaignItemsError } = await client
      .from("approval_items")
      .select("id")
      .eq("campaign_id", filter.campaignId);
    if (campaignItemsError) {
      throw new Error(`approval_items by campaign failed: ${campaignItemsError.message}`);
    }
    itemIdFilter = (campaignItems ?? []).map((row: { id: string }) => row.id);
    if (itemIdFilter.length === 0) return [];
  }

  let decisionsQuery = client
    .from("approval_decisions")
    .select("id,approval_item_id,decision,decided_by,decided_at,decision_notes,previous_status,next_status")
    .order("decided_at", { ascending: false })
    .limit(limit);
  if (itemIdFilter) {
    decisionsQuery = decisionsQuery.in("approval_item_id", itemIdFilter);
  }

  const { data: decisions, error: decisionsError } = await decisionsQuery;
  if (decisionsError) {
    throw new Error(`approval_decisions query failed: ${decisionsError.message}`);
  }
  const decisionRows = (decisions ?? []) as Array<{
    id: string;
    approval_item_id: string;
    decision: string;
    decided_by: string;
    decided_at: string;
    decision_notes: string | null;
    previous_status: string | null;
    next_status: string;
  }>;
  if (decisionRows.length === 0) return [];

  const itemIds = Array.from(new Set(decisionRows.map((row) => row.approval_item_id)));
  const { data: items, error: itemsError } = await client
    .from("approval_items")
    .select("id,item_type,risk_level,campaign_id")
    .in("id", itemIds);
  if (itemsError) {
    throw new Error(`approval_items lookup failed: ${itemsError.message}`);
  }
  const itemById = new Map<string, { item_type: string; risk_level: string | null; campaign_id: string | null }>(
    (items ?? []).map((row: { id: string; item_type: string; risk_level: string | null; campaign_id: string | null }) => [
      row.id,
      { item_type: row.item_type, risk_level: row.risk_level, campaign_id: row.campaign_id },
    ]),
  );

  const campaignIds = Array.from(
    new Set(Array.from(itemById.values()).map((i) => i.campaign_id).filter((id): id is string => Boolean(id))),
  );
  const campaignById = new Map<string, string>();
  if (campaignIds.length > 0) {
    const { data: campaigns, error: campaignsError } = await client.from("campaigns").select("id,name").in("id", campaignIds);
    if (campaignsError) {
      throw new Error(`campaigns lookup failed: ${campaignsError.message}`);
    }
    for (const row of (campaigns ?? []) as Array<{ id: string; name: string }>) {
      campaignById.set(row.id, row.name);
    }
  }

  return decisionRows.map((row) => {
    const item = itemById.get(row.approval_item_id) ?? null;
    const campaignId = item?.campaign_id ?? null;
    return {
      id: row.id,
      approvalItemId: row.approval_item_id,
      itemType: item?.item_type ?? "unknown",
      decision: row.decision,
      decidedBy: row.decided_by,
      decidedAt: row.decided_at,
      decisionNotes: row.decision_notes,
      previousStatus: row.previous_status,
      nextStatus: row.next_status,
      campaignId,
      campaignName: campaignId ? campaignById.get(campaignId) ?? null : null,
      riskLevel: item?.risk_level ?? null,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/approvals/__tests__/history.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/approvals/read-model.ts src/lib/approvals/__tests__/history.test.ts
git commit -m "feat(approvals): listApprovalHistory read-model for the activity ledger"
```

---

### Task 4: `GET /api/v1/approvals/history` route

**Files:**
- Create: `src/app/api/v1/approvals/history/route.ts`
- Test: `src/app/api/v1/approvals/history/route.test.ts`

Bearer-gated with `HERMES_AGENT_API_TOKEN` (same token Mark already uses), `503` when Supabase admin is unconfigured, supports `?campaign_id=` and `?limit=`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/approvals/history/route.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

function historyRequest(authorization?: string, query = "") {
  return new Request(`http://localhost/api/v1/approvals/history${query}`, {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/v1/approvals/history", () => {
  const original = process.env.HERMES_AGENT_API_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.HERMES_AGENT_API_TOKEN;
    else process.env.HERMES_AGENT_API_TOKEN = original;
  });

  it("returns 503 when no token is configured", async () => {
    delete process.env.HERMES_AGENT_API_TOKEN;
    const res = await GET(historyRequest("Bearer whatever"));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("not_configured");
  });

  it("returns 401 on a bad token", async () => {
    process.env.HERMES_AGENT_API_TOKEN = "secret";
    const res = await GET(historyRequest("Bearer wrong"));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/v1/approvals/history/route.test.ts`
Expected: FAIL — module `./route` not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/v1/approvals/history/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { checkBearerToken } from "@/lib/auth/api-token";
import { listApprovalHistory } from "@/lib/approvals/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Read-only ledger of human approval decisions, newest first. Mark calls this to
 * reference what has already been approved/declined/reverted when planning.
 *
 *   GET /api/v1/approvals/history?campaign_id=<uuid>&limit=<n>
 *   Authorization: Bearer <HERMES_AGENT_API_TOKEN>
 *
 *   200 -> { ok: true, count, decisions: [...] }
 *   401 -> bad/missing token
 *   503 -> token or Supabase admin not configured
 */
export async function GET(request: Request) {
  const auth = checkBearerToken(request, "HERMES_AGENT_API_TOKEN");

  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set HERMES_AGENT_API_TOKEN on this deployment to read approval history." }
        : { ok: false, status: "unauthorized", message: "Approval history requires a valid bearer token." },
      { status: auth.status },
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required to read approval history." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaign_id") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 100, 1), 500) : 100;

  const decisions = await listApprovalHistory({ campaignId, limit });

  return NextResponse.json({ ok: true, count: decisions.length, decisions }, { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/v1/approvals/history/route.test.ts`
Expected: PASS (2 tests). (The 401/503 paths return before any Supabase call, matching the ping-route test pattern.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/approvals/history/route.ts src/app/api/v1/approvals/history/route.test.ts
git commit -m "feat(api): GET /api/v1/approvals/history bearer-gated ledger for Mark"
```

---

### Task 5: Inbox server actions

**Files:**
- Create: `src/app/_data/inbox-actions.ts`

Thin `"use server"` wrappers reusing the decision engine. Approve/decline reuse `decideApprovalItem`; undo uses `undoDecision`. All gate on `requireOperator()` + `isSupabaseAdminConfigured()` and revalidate Today + the campaign + campaigns list. Shaped for `useActionState` (single `formData` arg).

- [ ] **Step 1: Implement the actions**

Create `src/app/_data/inbox-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { type ApprovalDecision, decideApprovalItem, undoDecision } from "@/lib/campaigns/decisions";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type InboxActionState = { ok: boolean; message: string; undo?: { approvalItemId: string } } | null;

const INBOX_DECISIONS: ApprovalDecision[] = ["approved", "declined"];

function revalidateAfterDecision(campaignId: string) {
  revalidatePath("/");
  revalidatePath("/approvals");
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

/**
 * One-click approve/decline from the Today inbox. Real state transition; outbound
 * stays locked. Returns an `undo` handle so the client can offer a reversal toast.
 */
export async function decideFromInboxAction(_previous: InboxActionState, formData: FormData): Promise<InboxActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the decision can't be recorded." };
  }

  const approvalItemId = String(formData.get("approvalItemId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();

  if (!approvalItemId) return { ok: false, message: "Missing approval item." };
  if (!INBOX_DECISIONS.includes(decision as ApprovalDecision)) {
    return { ok: false, message: "Inbox supports approve or decline only." };
  }

  try {
    await decideApprovalItem(
      { approvalItemId, decision: decision as ApprovalDecision, operator: "Operator" },
      getSupabaseAdminClient(),
    );
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't record the decision." };
  }

  revalidateAfterDecision(campaignId);
  const verb = decision === "approved" ? "Approved" : "Declined";
  return { ok: true, message: `${verb}. Outbound stays locked.`, undo: { approvalItemId } };
}

/**
 * Reverse the most recent inbox decision (append-only). Powers the undo toast.
 */
export async function undoInboxDecisionAction(_previous: InboxActionState, formData: FormData): Promise<InboxActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the undo can't be recorded." };
  }

  const approvalItemId = String(formData.get("approvalItemId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!approvalItemId) return { ok: false, message: "Missing approval item." };

  try {
    await undoDecision({ approvalItemId, operator: "Operator" }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't undo the decision." };
  }

  revalidateAfterDecision(campaignId);
  return { ok: true, message: "Decision undone." };
}
```

- [ ] **Step 2: Typecheck/lint the new file**

Run: `pnpm lint`
Expected: no errors for `src/app/_data/inbox-actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/_data/inbox-actions.ts
git commit -m "feat(today): inbox approve/decline/undo server actions"
```

---

### Task 6: Today inbox component + wire into the Today page

**Files:**
- Create: `src/app/_components/approval-inbox.tsx`
- Modify: `src/app/page.tsx`

Risk-gated rows: `low`/`medium` show inline Approve/Decline; `high`/`blocked` show an "Open →" link to the campaign. After a decision the row disappears and an undo toast appears briefly.

- [ ] **Step 1: Implement the inbox component**

Create `src/app/_components/approval-inbox.tsx`:

```typescript
"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, StatusPill } from "./page-header";
import { decideFromInboxAction, undoInboxDecisionAction } from "../_data/inbox-actions";

export type InboxItem = {
  id: string;
  title: string;
  persona: string;
  riskLevel: string;
  campaignId: string | null;
};

function isHighRisk(risk: string) {
  return /high|blocked/i.test(risk);
}

function riskTone(risk: string): "amber" | "red" | "green" | "blue" | "gray" {
  if (/blocked/i.test(risk)) return "red";
  if (/high/i.test(risk)) return "red";
  if (/medium/i.test(risk)) return "amber";
  return "green";
}

export function ApprovalInbox({ items }: { items: InboxItem[] }) {
  const [decided, setDecided] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ approvalItemId: string; campaignId: string | null; message: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const visible = items.filter((item) => !decided[item.id]);

  async function decide(item: InboxItem, decision: "approved" | "declined") {
    setPending(item.id);
    const form = new FormData();
    form.set("approvalItemId", item.id);
    form.set("campaignId", item.campaignId ?? "");
    form.set("decision", decision);
    const result = await decideFromInboxAction(null, form);
    setPending(null);
    if (result?.ok) {
      setDecided((prev) => ({ ...prev, [item.id]: true }));
      if (result.undo) {
        setToast({ approvalItemId: result.undo.approvalItemId, campaignId: item.campaignId, message: result.message });
      }
    } else if (result) {
      setToast({ approvalItemId: item.id, campaignId: item.campaignId, message: result.message });
    }
  }

  async function undo() {
    if (!toast) return;
    const form = new FormData();
    form.set("approvalItemId", toast.approvalItemId);
    form.set("campaignId", toast.campaignId ?? "");
    await undoInboxDecisionAction(null, form);
    setDecided((prev) => ({ ...prev, [toast.approvalItemId]: false }));
    setToast(null);
  }

  if (visible.length === 0) {
    return <p className="px-5 py-6 text-sm text-[var(--text-secondary)]">Nothing waiting on your approval. Mark will surface new work here.</p>;
  }

  return (
    <div className="relative">
      <ul className="divide-y divide-[var(--border-hairline)]">
        {visible.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-[var(--text-primary)]">{item.title}</div>
              <div className="mt-0.5 text-sm text-[var(--text-secondary)]">{item.persona}</div>
            </div>
            <StatusPill tone={riskTone(item.riskLevel)}>{item.riskLevel}</StatusPill>
            {isHighRisk(item.riskLevel) ? (
              <Link
                href={item.campaignId ? `/campaigns/${item.campaignId}` : "/approvals"}
                className="text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                Open &rarr;
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="primary" disabled={pending === item.id} onClick={() => decide(item, "approved")}>
                  Approve
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending === item.id} onClick={() => decide(item, "declined")}>
                  Decline
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {toast ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-[var(--border-panel)] bg-[var(--surface-raised)] px-5 py-3 text-sm">
          <span className="font-semibold text-[var(--text-primary)]">{toast.message}</span>
          <button type="button" onClick={undo} className="font-semibold text-[var(--accent)] hover:underline">
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the Today page**

In `src/app/page.tsx`, add the import near the existing `_components` imports:

```typescript
import { ApprovalInbox, type InboxItem } from "./_components/approval-inbox";
```

Build the inbox items from the already-loaded `approvals` (just before the `return`):

```typescript
  const inboxItems: InboxItem[] = approvals.map((card) => ({
    id: card.id,
    title: card.title,
    persona: card.persona,
    riskLevel: card.riskLevel,
    campaignId: card.campaign.id,
  }));
```

Replace the `<OpportunityBucket title="Waiting on approval" ... />` line inside the `Needs attention now` panel's grid with the rest of the buckets unchanged, and add a dedicated inbox panel ABOVE the "Needs attention now" `WorkspacePanel`:

```tsx
          <WorkspacePanel
            eyebrow="Decide next"
            title="Needs your approval"
            description="Low and medium risk can be decided here; high or blocked items open the campaign so you see the full draft first. Outbound stays locked."
          >
            <ApprovalInbox items={inboxItems} />
          </WorkspacePanel>
```

Then delete the now-redundant `Waiting on approval` `OpportunityBucket` (the first bucket at line ~96) so triage isn't duplicated. Leave the other five buckets intact.

- [ ] **Step 3: Lint + build the page**

Run: `pnpm lint`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds; `/` compiles.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/approval-inbox.tsx src/app/page.tsx
git commit -m "feat(today): risk-gated Needs-your-approval inbox with undo toast"
```

---

### Task 7: Rewrite `/approvals` as the Activity ledger + rename nav

**Files:**
- Rewrite: `src/app/approvals/page.tsx`
- Modify: `src/app/_data/growth-engine.ts`

The page becomes a read-only, reverse-chronological table sourced from `listApprovalHistory`. No action buttons.

- [ ] **Step 1: Rename the nav item**

In `src/app/_data/growth-engine.ts`, change the second `navItems` entry:

```typescript
  { label: "Activity", href: "/approvals", icon: "approval" },
```

(Keep the `href` and `icon`; only the label changes.)

- [ ] **Step 2: Rewrite the approvals page**

Replace the entire contents of `src/app/approvals/page.tsx` with:

```tsx
import Link from "next/link";
import { connection } from "next/server";

import { PageHeader, StatusPill, EmptyState } from "@/app/_components/page-header";
import { listApprovalHistory, type ApprovalHistoryEntry } from "@/lib/approvals/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

function decisionTone(decision: string): "green" | "red" | "amber" | "gray" | "blue" {
  if (/approved/i.test(decision)) return "green";
  if (/declined|rejected|blocked/i.test(decision)) return "red";
  if (/revision/i.test(decision)) return "amber";
  if (/reverted/i.test(decision)) return "blue";
  return "gray";
}

export default async function ActivityPage() {
  await connection();

  const decisions = isSupabaseAdminConfigured() ? await loadHistory() : [];

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Decision history"
        description="A read-only record of every approval, decline, revision, and undo. Mark references this when planning. Decisions are made on Today or inside a campaign."
      />

      {decisions.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3">Decision</th>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Campaign</th>
                <th className="px-5 py-3">Who</th>
                <th className="px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {decisions.map((row: ApprovalHistoryEntry) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-[var(--text-secondary)]">{formatWhen(row.decidedAt)}</td>
                  <td className="px-5 py-3"><StatusPill tone={decisionTone(row.decision)}>{row.decision}</StatusPill></td>
                  <td className="px-5 py-3 text-[var(--text-primary)]">{row.itemType}</td>
                  <td className="px-5 py-3">
                    {row.campaignId ? (
                      <Link className="font-semibold text-[var(--accent)] hover:underline" href={`/campaigns/${row.campaignId}`}>
                        {row.campaignName ?? row.campaignId}
                      </Link>
                    ) : (
                      <span className="text-[var(--text-muted)]">&mdash;</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">{row.decidedBy}</td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">{row.decisionNotes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No decisions yet"
          detail="When you approve, decline, or revise work on Today or inside a campaign, it is recorded here."
        />
      )}
    </>
  );
}

async function loadHistory() {
  try {
    return await listApprovalHistory({ limit: 200 });
  } catch {
    return [];
  }
}

function formatWhen(iso: string) {
  return iso.replace("T", " ").replace(/\.\d+Z$/, "Z");
}
```

Note: `PageHeader({ eyebrow, title, description, aside })`, `StatusPill`, and `EmptyState` are all verified exports of `src/app/_components/page-header.tsx` with the prop names used above — no changes needed.

- [ ] **Step 3: Lint + build**

Run: `pnpm lint`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds; `/approvals` compiles as a server component.

- [ ] **Step 4: Commit**

```bash
git add src/app/approvals/page.tsx src/app/_data/growth-engine.ts
git commit -m "feat(activity): rewrite /approvals as read-only decision ledger; rename nav to Activity"
```

---

### Task 8: Gallery pending badge

**Files:**
- Modify: `src/app/campaigns/_components/campaign-gallery.tsx`

The card already shows `approvalCount`. Add a small "● N pending" badge on the cover when the campaign has approvals waiting. The list item type has `approvalCount` but not a pending-only count; treat `status === "pending_approval"` campaigns as having a live gate, and keep the existing `approvalCount` stat.

- [ ] **Step 1: Add the badge**

In `src/app/campaigns/_components/campaign-gallery.tsx`, inside `CampaignCard`, add directly after `<CardCover campaign={campaign} />`:

```tsx
      {campaign.status === "pending_approval" ? (
        <div className="flex items-center gap-1.5 border-b border-[var(--border-hairline)] bg-[oklch(0.82_0.13_85/0.12)] px-4 py-1.5 text-xs font-semibold text-[var(--text-primary)]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.14_70)]" />
          Awaiting approval
        </div>
      ) : null}
```

- [ ] **Step 2: Lint + build**

Run: `pnpm lint && pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/campaign-gallery.tsx
git commit -m "feat(campaigns): show awaiting-approval badge on gallery cards"
```

---

### Task 9: Seed the fully-filled test campaign

**Files:**
- Create: `scripts/seed-test-campaign.mjs`
- Modify: `package.json`

Mirrors `scripts/seed-hermes-demo.mjs` conventions (manual `.env.local` load, service-role client, `runId` suffix, `insertOne` helper). Produces one campaign with every tab populated: Brief (overview fields), Deliverables (8 assets across types), Targets & sources (company/contacts/leads + evidence), Mark notes (reasoning payload), Approval gate (3 approval items, one already decided so the ledger isn't empty).

- [ ] **Step 1: Write the seed script**

Create `scripts/seed-test-campaign.mjs`:

```javascript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const envText = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    process.env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
}

function getSupabase() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function insertOne(supabase, table, values) {
  const { data, error } = await supabase.from(table).insert(values).select("id").single();
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  return data.id;
}

const PERSONA = "persona_property_manager";

const ASSETS = [
  { asset_type: "landing_page", channel: "web", title: "Flood-ready landing page", draft_body: "Headline: Water in the building? We document, mitigate, and rebuild — fast.\nCTA: Request Vendor Packet." },
  { asset_type: "search_ad", channel: "google_ads", title: "Search ad — emergency water cleanup", draft_body: "Headline: 24/7 Water Damage Mitigation. Desc: Insurance-grade documentation for property managers." },
  { asset_type: "social_ad", channel: "meta_ad", title: "Social ad — property manager partner", draft_body: "Protect your North Shore portfolio. Priority response for managed buildings." },
  { asset_type: "email", channel: "email", title: "Partner intro email", draft_body: "Subject: Priority water-loss response for your North Shore properties\n\nHi {{first_name}},\n\nWhen a unit floods, your residents call you first. We give managed-building partners a documented, insurance-ready handoff.\n\nRequest the vendor packet to pre-approve us." },
  { asset_type: "sms", channel: "sms", title: "Follow-up SMS", draft_body: "Big Shoulders Restoration: your managed-building vendor packet is ready. Reply PACKET to receive it." },
  { asset_type: "video_prompt", channel: "media", title: "Video prompt — 30s testimonial", draft_body: "30s testimonial: property manager describes a burst-pipe night handled in 2 hours with full documentation." },
  { asset_type: "image_prompt", channel: "media", title: "Image prompt — before/after", draft_body: "Before/after of a restored basement common area; clean, professional, no people." },
  { asset_type: "one_pager", channel: "doc", title: "Vendor packet one-pager", draft_body: "Services, response SLA, insurance documentation process, references. For property-manager pre-approval." },
];

async function seedTestCampaign() {
  const supabase = getSupabase();
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

  const companyId = await insertOne(supabase, "companies", {
    name: `North Shore Property Group ${runId}`,
    persona: PERSONA,
    status: "active",
    metadata: { demo_seed: true, run_id: runId, source_note: "Manages 14 multifamily buildings along the North Shore.", service_area_zips: ["60091", "60093", "60201"] },
  });

  const contactId = await insertOne(supabase, "contacts", {
    company_id: companyId,
    persona: PERSONA,
    metadata: { demo_seed: true, run_id: runId, relationship_stage: "engaged", confidence_score: 88, title: "Director of Operations" },
  });

  const leadId = await insertOne(supabase, "leads", {
    company_id: companyId,
    contact_id: contactId,
    persona: PERSONA,
    metadata: { demo_seed: true, run_id: runId, confidence_score: 84, status: "qualified", score: 84 },
  });

  const campaignId = await insertOne(supabase, "campaigns", {
    name: `Spring Flood Recovery — North Shore Property Managers ${runId}`,
    persona: PERSONA,
    restoration_focus: "water_backup",
    status: "pending_approval",
    company_id: companyId,
    contact_id: contactId,
    lead_id: leadId,
    owner: "Mark (Hermes)",
    objective: "Pre-approve Big Shoulders as the priority water-loss vendor for North Shore managed buildings before spring thaw.",
    audience_summary: "Property managers and operations directors overseeing multifamily portfolios in 60091/60093/60201.",
    offer_summary: "Documented, insurance-ready water-loss response with a managed-building SLA and a vendor pre-approval packet.",
    compliance_notes: "No outbound send until human approval. Persona-safe CTAs only (Request Vendor Packet / Become a Partner).",
    source_signal: { demo_seed: true, run_id: runId, evidence: ["https://example.com/north-shore-flood-advisory", "https://example.com/property-manager-directory"], lead_id: leadId, score: 88 },
    reasoning_payload: {
      demo_seed: true,
      why_built: "Spring thaw + aging North Shore plumbing stock drives water-backup losses; managed buildings concentrate decision-making in a few property managers, so pre-approval unlocks many properties per partner.",
      recommended_action: "Approve the partner intro email and vendor packet; keep paid ads gated pending budget sign-off.",
      tools_used: ["crm_lookup", "evidence_search", "creative_generator"],
      guardrails: ["No outbound send before approval", "No ad spend before budget sign-off", "Persona-safe CTAs only"],
      prompt_inputs: { persona: PERSONA, restoration_focus: "water_backup", geo: ["60091", "60093", "60201"] },
    },
    audit_payload: { demo_seed: true, run_id: runId, created_by: "seed-test-campaign" },
  });

  await insertOne(supabase, "campaign_audiences", {
    campaign_id: campaignId,
    persona: PERSONA,
    audience_name: "North Shore managed-building decision makers",
    relationship_stage: "engaged",
    inclusion_rules: { zips: ["60091", "60093", "60201"], role: ["property_manager", "operations_director"] },
    exclusion_rules: { existing_partner: true },
    estimated_size: 42,
    reasoning_payload: { demo_seed: true, run_id: runId },
  });

  const assetIds = [];
  for (const asset of ASSETS) {
    const id = await insertOne(supabase, "campaign_assets", {
      campaign_id: campaignId,
      asset_type: asset.asset_type,
      channel: asset.channel,
      title: asset.title,
      status: "pending_approval",
      tool_source: "creative_generator",
      draft_body: asset.draft_body,
      dispatch_locked: true,
      reasoning_payload: { demo_seed: true, run_id: runId },
      audit_payload: { demo_seed: true, run_id: runId },
    });
    assetIds.push(id);
  }

  // Approval gate: 3 items. The email is already approved so the Activity ledger
  // and the history API are non-empty; the others stay pending (one high-risk).
  const emailAssetId = assetIds[3];
  const emailApprovalId = await insertOne(supabase, "approval_items", {
    campaign_id: campaignId,
    campaign_asset_id: emailAssetId,
    company_id: companyId,
    contact_id: contactId,
    lead_id: leadId,
    item_type: "email_campaign_asset",
    status: "approved",
    risk_level: "low",
    draft_output: ASSETS[3].draft_body,
    requested_by: "hermes",
    reviewed_by: "Evan",
    reviewed_at: new Date().toISOString(),
    reasoning_payload: { demo_seed: true, run_id: runId },
    audit_payload: { demo_seed: true, run_id: runId },
  });

  await insertOne(supabase, "approval_decisions", {
    approval_item_id: emailApprovalId,
    decision: "approved",
    decided_by: "Evan",
    decision_notes: "Copy is on-brand and persona-safe. Approved; outbound still gated.",
    previous_status: "pending_approval",
    next_status: "approved",
    metadata: { demo_seed: true, run_id: runId, source: "seed-test-campaign", outbound_locked: true },
  });

  await insertOne(supabase, "approval_items", {
    campaign_id: campaignId,
    campaign_asset_id: assetIds[0],
    company_id: companyId,
    item_type: "landing_page_campaign_asset",
    status: "pending_approval",
    risk_level: "medium",
    draft_output: ASSETS[0].draft_body,
    requested_by: "hermes",
    reasoning_payload: { demo_seed: true, run_id: runId },
    audit_payload: { demo_seed: true, run_id: runId },
  });

  await insertOne(supabase, "approval_items", {
    campaign_id: campaignId,
    campaign_asset_id: assetIds[1],
    company_id: companyId,
    item_type: "paid_search_ad",
    status: "pending_approval",
    risk_level: "high",
    draft_output: ASSETS[1].draft_body,
    requested_by: "hermes",
    compliance_notes: "Paid spend — requires budget sign-off before launch.",
    reasoning_payload: { demo_seed: true, run_id: runId },
    audit_payload: { demo_seed: true, run_id: runId },
  });

  return { runId, companyId, contactId, leadId, campaignId, assetIds, emailApprovalId };
}

seedTestCampaign()
  .then((result) => console.log(JSON.stringify({ ok: true, ...result }, null, 2)))
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
    process.exit(1);
  });
```

**IMPORTANT — verify columns before running.** Open `supabase/migrations/20260528162000_hyper_personalization_layer.sql` and confirm the column names used above exist on `companies`, `contacts`, `leads`, `campaigns`, `campaign_assets`, `campaign_audiences`, `approval_items`, `approval_decisions`. The `companies`/`contacts`/`leads` inserts here use only `name`/`persona`/`status`/FK/`metadata` to stay schema-safe; if those tables require additional NOT NULL columns, add them with demo values. Do not guess at columns that aren't in the migration.

- [ ] **Step 2: Add the package.json script**

In `package.json` `scripts`, add after `seed:hermes-demo`:

```json
    "seed:test-campaign": "node scripts/seed-test-campaign.mjs",
```

- [ ] **Step 3: Run the seed**

Run: `pnpm seed:test-campaign`
Expected: prints `{ "ok": true, "campaignId": "…", … }`. If it errors on a missing/NOT NULL column, fix the insert per the migration and re-run.

- [ ] **Step 4: Verify in the app**

Run: `pnpm dev`, open `/campaigns`, find "Spring Flood Recovery — North Shore Property Managers", and confirm every tab is populated: Deliverables (8), Media, Brief (all fields), Targets & sources (company/contacts/leads/evidence), Mark notes (reasoning), Approval gate (2 pending + history). Open `/approvals` and confirm the approved-email row appears. Confirm Today shows the two pending items in the inbox.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-test-campaign.mjs package.json
git commit -m "feat(seed): fully-filled Spring Flood Recovery test campaign"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: all tests pass, including the new `decisions.test.ts`, `history.test.ts`, and `route.test.ts`.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build succeeds; `/`, `/approvals`, `/campaigns`, and `/api/v1/approvals/history` all compile.

- [ ] **Step 4: Manual smoke (with `pnpm dev`)**

- Today inbox: approve a low/medium item → row disappears, undo toast appears → click Undo → item returns; high-risk item shows "Open →".
- `/approvals`: shows the decision (and the undo) as ledger rows, newest first; no action buttons.
- API: `curl -s -H "Authorization: Bearer $HERMES_AGENT_API_TOKEN" "http://localhost:3000/api/v1/approvals/history?limit=5"` returns `{ ok: true, decisions: [...] }`.

- [ ] **Step 5: Final commit (if any fixups)**

```bash
git add -A
git commit -m "chore: verification fixups for campaign workflow redesign"
```

---

## Self-Review notes

- **Spec coverage:** §1 inbox → Tasks 5/6; §2 decide-in-context → already built (noted, plus Task 8 badge); §3 ledger → Task 7; §4 read API → Tasks 3/4; §5 server actions → Tasks 2/5; §6 seed → Task 9; §7 testing → Tasks 2/3/4 + Task 10. The append-only undo required one additive enum value not in the original spec (Task 1) — surfaced because `approval_decision_kind` lacked a reversal value.
- **Type consistency:** `undoDecision(input, client)` returns `{ approvalItemId, restoredStatus }`; `decideApprovalItem` reused unchanged; `listApprovalHistory(filter, client)` returns `ApprovalHistoryEntry[]`; inbox actions return `InboxActionState`; `ApprovalInbox` consumes `InboxItem[]` built from `ApprovalCard` fields (`id`, `title`, `persona`, `riskLevel`, `campaign.id`).
- **Verified signatures:** `PageHeader({eyebrow,title,description,aside})`, `WorkspacePanel({title,eyebrow,description,aside,children})`, `Button` (spreads native button props, so `onClick`/`disabled`/`name`/`value` are valid), `StatusPill`, `EmptyState` — all confirmed against `src/app/_components/{page-header,workspace}.tsx`.
- **One remaining check point (not a placeholder):** the exact non-null columns on CRM tables (`companies`/`contacts`/`leads`) for the seed (Task 9). Task 9 Step 1 calls out exactly what to confirm against the migration and forbids inventing columns.
