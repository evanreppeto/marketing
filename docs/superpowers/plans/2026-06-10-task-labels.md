# Task Labels (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable, colored label catalog to the Arc task board — operator-curated, with Arc able to suggest existing labels or propose new ones (pending operator acceptance).

**Architecture:** Pure label logic (palette, name normalization, validation) in `src/domain/task-labels.ts`; I/O in `src/lib/task-labels/`; operator mutations as `requireOperator()`-gated server actions; Arc's suggestions via a bearer-gated `/api/v1/arc` route. Two new tables back it; the board read-model batch-loads labels onto each task.

**Tech Stack:** Next.js 16 server components + server actions, Supabase (Postgres + admin client), Vitest. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-06-10-task-labels-design.md`

**Scope:** Phase A only (labels). Phase B (custom statuses) is a separate future plan. The 5 lifecycle columns stay fixed.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `supabase/migrations/20260610180000_task_labels.sql` | `task_labels` + `agent_task_label_assignments` tables | Create |
| `src/domain/task-labels.ts` | Palette, name normalization, validation (pure) | Create |
| `src/domain/__tests__/task-labels.test.ts` | Domain tests | Create |
| `src/domain/index.ts` | Re-export `./task-labels` | Modify |
| `src/lib/task-labels/read-model.ts` | `listLabels`, `getLabelsForTasks` | Create |
| `src/lib/task-labels/mutations.ts` | create/rename/recolor/delete/apply/remove/accept/dismiss | Create |
| `src/lib/task-labels/suggest.ts` | `suggestLabel` (agent path) | Create |
| `src/lib/task-labels/__tests__/*.test.ts` | Persistence tests | Create |
| `src/app/agent-operations/labels-actions.ts` | Operator-gated server actions | Create |
| `src/app/api/v1/arc/labels/route.ts` | `GET` catalog | Create |
| `src/app/api/v1/arc/tasks/[id]/labels/suggest/route.ts` | `POST` suggest | Create |
| `src/app/api/v1/arc/tasks/[id]/labels/suggest/route.test.ts` | API test | Create |
| `src/lib/agent-operations/read-model.ts` | Add `labels` to `AgentOperationsTask` + dashboard | Modify |
| `src/app/agent-operations/label-chip.tsx` | Applied/suggested chip rendering | Create |
| `src/app/agent-operations/label-picker.tsx` | Add/create labels popover | Create |
| `src/app/agent-operations/task-kanban-board.tsx` | Render chips + label filter | Modify |

---

## Task 1: Migration — label tables

**Files:**
- Create: `supabase/migrations/20260610180000_task_labels.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Task labels: a reusable, colored catalog plus card assignments.
-- workspace_id is nullable now (single-tenant) for multi-tenant readiness later.

create table public.task_labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  name text not null check (length(btrim(name)) > 0),
  color text not null,
  status text not null default 'active' check (status in ('active', 'proposed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index task_labels_workspace_name_key
  on public.task_labels (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index task_labels_workspace_idx on public.task_labels (workspace_id);

create table public.agent_task_label_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  label_id uuid not null references public.task_labels(id) on delete cascade,
  state text not null default 'applied' check (state in ('applied', 'suggested')),
  suggested_by text,
  created_at timestamptz not null default now(),
  unique (task_id, label_id)
);

create index agent_task_label_assignments_task_idx on public.agent_task_label_assignments (task_id);
create index agent_task_label_assignments_label_idx on public.agent_task_label_assignments (label_id);
```

- [ ] **Step 2: Verify SQL parses (lightweight check)**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/20260610180000_task_labels.sql','utf8'); if(!/create table public.task_labels/.test(s)||!/agent_task_label_assignments/.test(s)) throw new Error('missing tables'); console.log('ok')"`
Expected: `ok`. (Migrations apply against a real Supabase; this is a presence check only.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610180000_task_labels.sql
git commit -m "feat(labels): task_labels + assignments migration"
```

---

## Task 2: Domain — palette, normalization, validation

**Files:**
- Create: `src/domain/task-labels.ts`
- Test: `src/domain/__tests__/task-labels.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/task-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  LABEL_COLORS,
  isLabelColor,
  normalizeLabelName,
  labelKey,
  validateNewLabel,
} from "../task-labels";

describe("LABEL_COLORS / isLabelColor", () => {
  it("is the fixed 8-key palette", () => {
    expect(LABEL_COLORS).toEqual(["gold", "green", "red", "amber", "blue", "teal", "slate", "clay"]);
  });
  it("validates membership", () => {
    expect(isLabelColor("gold")).toBe(true);
    expect(isLabelColor("purple")).toBe(false);
  });
});

describe("normalizeLabelName / labelKey", () => {
  it("trims and collapses internal whitespace for display", () => {
    expect(normalizeLabelName("  partner   outreach ")).toBe("partner outreach");
  });
  it("labelKey is the lowercased comparison form", () => {
    expect(labelKey("  Partner   Outreach ")).toBe("partner outreach");
    expect(labelKey("URGENT")).toBe("urgent");
  });
});

describe("validateNewLabel", () => {
  it("accepts a clean label", () => {
    expect(validateNewLabel({ name: "Urgent", color: "red" })).toEqual({ ok: true });
  });
  it("rejects empty name", () => {
    expect(validateNewLabel({ name: "   ", color: "red" })).toEqual({ ok: false, reason: "empty_name" });
  });
  it("rejects an overlong name", () => {
    expect(validateNewLabel({ name: "x".repeat(41), color: "red" })).toEqual({ ok: false, reason: "name_too_long" });
  });
  it("rejects an unknown color", () => {
    expect(validateNewLabel({ name: "Urgent", color: "neon" })).toEqual({ ok: false, reason: "bad_color" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/task-labels.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Write the implementation**

Create `src/domain/task-labels.ts`:

```ts
/** Fixed label palette (keys, not hex). DESIGN.md-compliant: no neon, no purple. */
export const LABEL_COLORS = ["gold", "green", "red", "amber", "blue", "teal", "slate", "clay"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

const MAX_NAME_LENGTH = 40;

export function isLabelColor(value: string): value is LabelColor {
  return (LABEL_COLORS as readonly string[]).includes(value);
}

/** Display form: trim ends + collapse internal whitespace runs to single spaces. */
export function normalizeLabelName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Comparison form for case-insensitive dedup. */
export function labelKey(name: string): string {
  return normalizeLabelName(name).toLowerCase();
}

export type NewLabelInput = { name: string; color: string };
export type LabelValidation =
  | { ok: true }
  | { ok: false; reason: "empty_name" | "name_too_long" | "bad_color" };

export function validateNewLabel(input: NewLabelInput): LabelValidation {
  const name = normalizeLabelName(input.name);
  if (name.length === 0) return { ok: false, reason: "empty_name" };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, reason: "name_too_long" };
  if (!isLabelColor(input.color)) return { ok: false, reason: "bad_color" };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/task-labels.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-export from the domain barrel**

In `src/domain/index.ts`, add a line alongside the other `export * from` lines:

```ts
export * from "./task-labels";
```

- [ ] **Step 6: Verify barrel + commit**

Run: `pnpm test src/domain/__tests__/task-labels.test.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep task-labels || echo "tsc clean"`
Expected: PASS, `tsc clean`.

```bash
git add src/domain/task-labels.ts src/domain/__tests__/task-labels.test.ts src/domain/index.ts
git commit -m "feat(labels): domain palette, normalization, validation"
```

---

## Task 3: Persistence read-model — listLabels + getLabelsForTasks

**Files:**
- Create: `src/lib/task-labels/read-model.ts`
- Test: `src/lib/task-labels/__tests__/read-model.test.ts`

This module exposes the catalog and a batch loader for the board. Mirror the guard/shape conventions in `src/lib/agent-operations/read-model.ts` (study it first: `isSupabaseAdminConfigured()` guard, `getSupabaseAdminClient()`, throw-on-error).

- [ ] **Step 1: Write the failing test**

Create `src/lib/task-labels/__tests__/read-model.test.ts`. Use the codebase's existing Supabase test-mock helper `createSupabaseQueryMock` from `@/lib/repos/__tests__/test-helpers` (the same one `src/lib/arc-api/__tests__/tasks.test.ts` uses — open that file to copy the exact import + usage idiom):

```ts
import { describe, expect, it } from "vitest";

import { getLabelsForTasks } from "../read-model";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

describe("getLabelsForTasks", () => {
  it("returns an empty map for no task ids without querying", async () => {
    const supabase = createSupabaseQueryMock({});
    const result = await getLabelsForTasks([], supabase);
    expect(result.size).toBe(0);
  });

  it("groups applied + suggested labels by task id", async () => {
    const supabase = createSupabaseQueryMock({
      agent_task_label_assignments: {
        data: [
          { task_id: "t1", label_id: "l1", state: "applied", suggested_by: null, task_labels: { id: "l1", name: "Urgent", color: "red", status: "active" } },
          { task_id: "t1", label_id: "l2", state: "suggested", suggested_by: "arc", task_labels: { id: "l2", name: "Weather", color: "blue", status: "proposed" } },
        ],
        error: null,
      },
    });
    const result = await getLabelsForTasks(["t1"], supabase);
    expect(result.get("t1")).toEqual([
      { id: "l1", name: "Urgent", color: "red", state: "applied", suggestedBy: null },
      { id: "l2", name: "Weather", color: "blue", state: "suggested", suggestedBy: "arc" },
    ]);
  });
});
```

Note: if `createSupabaseQueryMock`'s keying differs (e.g. it keys by a chained call signature rather than table name), adapt the test to the helper's real API — the assertions on `getLabelsForTasks` output are what matter.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/task-labels/__tests__/read-model.test.ts`
Expected: FAIL — `getLabelsForTasks` not exported.

- [ ] **Step 3: Write the implementation**

Create `src/lib/task-labels/read-model.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

export type CatalogLabel = { id: string; name: string; color: string };
export type AssignedLabel = {
  id: string;
  name: string;
  color: string;
  state: "applied" | "suggested";
  suggestedBy: string | null;
};

type AssignmentRow = {
  task_id: string;
  label_id: string;
  state: string | null;
  suggested_by: string | null;
  task_labels: { id: string; name: string | null; color: string | null; status: string | null } | null;
};

/** Active catalog labels for pickers (proposed labels are hidden until accepted). */
export async function listLabels(
  workspaceId: string | null = null,
  client?: SupabaseClient,
): Promise<CatalogLabel[]> {
  if (!client && !isSupabaseAdminConfigured()) return [];
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("task_labels").select("id,name,color").eq("status", "active");
  query = workspaceId ? query.eq("workspace_id", workspaceId) : query.is("workspace_id", null);
  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw new Error(`listLabels failed: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name ?? "", color: row.color ?? "slate" }));
}

/** Batch-load assignments for the visible cards: Map<taskId, AssignedLabel[]>. */
export async function getLabelsForTasks(
  taskIds: string[],
  client?: SupabaseClient,
): Promise<Map<string, AssignedLabel[]>> {
  const map = new Map<string, AssignedLabel[]>();
  if (taskIds.length === 0) return map;
  if (!client && !isSupabaseAdminConfigured()) return map;
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("agent_task_label_assignments")
    .select("task_id,label_id,state,suggested_by,task_labels(id,name,color,status)")
    .in("task_id", taskIds);
  if (error) throw new Error(`getLabelsForTasks failed: ${error.message}`);

  for (const row of (data ?? []) as AssignmentRow[]) {
    if (!row.task_labels) continue;
    const entry: AssignedLabel = {
      id: row.task_labels.id,
      name: row.task_labels.name ?? "",
      color: row.task_labels.color ?? "slate",
      state: row.state === "suggested" ? "suggested" : "applied",
      suggestedBy: row.suggested_by,
    };
    const list = map.get(row.task_id) ?? [];
    list.push(entry);
    map.set(row.task_id, list);
  }
  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/task-labels/__tests__/read-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-labels/read-model.ts src/lib/task-labels/__tests__/read-model.test.ts
git commit -m "feat(labels): catalog + per-task read model"
```

---

## Task 4: Persistence mutations + suggest

**Files:**
- Create: `src/lib/task-labels/mutations.ts`
- Create: `src/lib/task-labels/suggest.ts`
- Test: `src/lib/task-labels/__tests__/mutations.test.ts`

Study `src/lib/arc-api/tasks.ts` for the read-row → validate → write rhythm and the `createSupabaseQueryMock` test idiom before writing.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/task-labels/__tests__/mutations.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createLabel, acceptSuggestion } from "../mutations";
import { suggestLabel } from "../suggest";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

describe("createLabel", () => {
  it("rejects an invalid color before any write", async () => {
    const supabase = createSupabaseQueryMock({});
    const result = await createLabel({ name: "Urgent", color: "neon" }, null, supabase);
    expect(result).toEqual({ ok: false, reason: "bad_color" });
  });

  it("inserts a normalized, active label", async () => {
    const supabase = createSupabaseQueryMock({
      task_labels: { data: { id: "l1", name: "Partner Outreach", color: "blue", status: "active" }, error: null },
    });
    const result = await createLabel({ name: "  Partner   Outreach ", color: "blue" }, null, supabase);
    expect(result.ok).toBe(true);
  });
});

describe("suggestLabel (propose new)", () => {
  it("creates a proposed label + a suggested assignment", async () => {
    const supabase = createSupabaseQueryMock({
      task_labels: { data: { id: "l9", name: "Weather", color: "blue", status: "proposed" }, error: null },
      agent_task_label_assignments: { data: { id: "a1" }, error: null },
    });
    const result = await suggestLabel("t1", { name: "Weather", color: "blue" }, null, supabase);
    expect(result.ok).toBe(true);
  });
});
```

(Adapt the mock setup to `createSupabaseQueryMock`'s real shape; the point is each function's contract is exercised.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/task-labels/__tests__/mutations.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `mutations.ts`**

Create `src/lib/task-labels/mutations.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { normalizeLabelName, validateNewLabel } from "@/domain";
import { getSupabaseAdminClient } from "../supabase/server";

export type CreateLabelResult =
  | { ok: true; id: string }
  | { ok: false; reason: "empty_name" | "name_too_long" | "bad_color" | "duplicate" };

export async function createLabel(
  input: { name: string; color: string },
  workspaceId: string | null = null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<CreateLabelResult> {
  const valid = validateNewLabel(input);
  if (!valid.ok) return { ok: false, reason: valid.reason };
  const name = normalizeLabelName(input.name);

  const { data, error } = await client
    .from("task_labels")
    .insert({ workspace_id: workspaceId, name, color: input.color, status: "active" })
    .select("id")
    .single<{ id: string }>();
  if (error) {
    if (error.code === "23505") return { ok: false, reason: "duplicate" };
    throw new Error(`createLabel failed: ${error.message}`);
  }
  return { ok: true, id: data.id };
}

export async function renameLabel(id: string, name: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const valid = validateNewLabel({ name, color: "gold" }); // color irrelevant; reuse name checks
  if (!valid.ok && valid.reason !== "bad_color") return { ok: false as const, reason: valid.reason };
  const { error } = await client
    .from("task_labels")
    .update({ name: normalizeLabelName(name), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`renameLabel failed: ${error.message}`);
  return { ok: true as const };
}

export async function recolorLabel(id: string, color: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client
    .from("task_labels")
    .update({ color, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`recolorLabel failed: ${error.message}`);
  return { ok: true as const };
}

export async function deleteLabel(id: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client.from("task_labels").delete().eq("id", id);
  if (error) throw new Error(`deleteLabel failed: ${error.message}`);
  return { ok: true as const };
}

export async function applyLabel(taskId: string, labelId: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client
    .from("agent_task_label_assignments")
    .upsert({ task_id: taskId, label_id: labelId, state: "applied", suggested_by: null }, { onConflict: "task_id,label_id" });
  if (error) throw new Error(`applyLabel failed: ${error.message}`);
  return { ok: true as const };
}

export async function removeAssignment(taskId: string, labelId: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client
    .from("agent_task_label_assignments")
    .delete()
    .eq("task_id", taskId)
    .eq("label_id", labelId);
  if (error) throw new Error(`removeAssignment failed: ${error.message}`);
  return { ok: true as const };
}

/** Accept a suggestion: applied assignment + the label becomes active if it was proposed. */
export async function acceptSuggestion(taskId: string, labelId: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error: aErr } = await client
    .from("agent_task_label_assignments")
    .update({ state: "applied", suggested_by: null })
    .eq("task_id", taskId)
    .eq("label_id", labelId);
  if (aErr) throw new Error(`acceptSuggestion (assignment) failed: ${aErr.message}`);
  const { error: lErr } = await client
    .from("task_labels")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", labelId)
    .eq("status", "proposed");
  if (lErr) throw new Error(`acceptSuggestion (label) failed: ${lErr.message}`);
  return { ok: true as const };
}

/** Dismiss a suggestion: delete the assignment; delete the label if it was a now-orphan proposal. */
export async function dismissSuggestion(taskId: string, labelId: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { error } = await client
    .from("agent_task_label_assignments")
    .delete()
    .eq("task_id", taskId)
    .eq("label_id", labelId);
  if (error) throw new Error(`dismissSuggestion failed: ${error.message}`);

  const { data: remaining, error: cErr } = await client
    .from("agent_task_label_assignments")
    .select("id")
    .eq("label_id", labelId)
    .limit(1);
  if (cErr) throw new Error(`dismissSuggestion (count) failed: ${cErr.message}`);
  if ((remaining ?? []).length === 0) {
    await client.from("task_labels").delete().eq("id", labelId).eq("status", "proposed");
  }
  return { ok: true as const };
}
```

- [ ] **Step 4: Write `suggest.ts`**

Create `src/lib/task-labels/suggest.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { normalizeLabelName, validateNewLabel } from "@/domain";
import { getSupabaseAdminClient } from "../supabase/server";

export type SuggestInput = { labelId: string } | { name: string; color: string };
export type SuggestResult =
  | { ok: true; labelId: string }
  | { ok: false; reason: "not_found" | "empty_name" | "name_too_long" | "bad_color" };

/**
 * Agent path: suggest an existing label or propose a new (proposed) one, then
 * insert a `suggested` assignment. Never applies directly and never creates an
 * `active` label — the operator accepts to confirm.
 */
export async function suggestLabel(
  taskId: string,
  input: SuggestInput,
  workspaceId: string | null = null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<SuggestResult> {
  let labelId: string;

  if ("labelId" in input) {
    const { data, error } = await client.from("task_labels").select("id").eq("id", input.labelId).maybeSingle();
    if (error) throw new Error(`suggestLabel lookup failed: ${error.message}`);
    if (!data) return { ok: false, reason: "not_found" };
    labelId = (data as { id: string }).id;
  } else {
    const valid = validateNewLabel(input);
    if (!valid.ok) return { ok: false, reason: valid.reason };
    const { data, error } = await client
      .from("task_labels")
      .insert({ workspace_id: workspaceId, name: normalizeLabelName(input.name), color: input.color, status: "proposed" })
      .select("id")
      .single<{ id: string }>();
    if (error) throw new Error(`suggestLabel insert failed: ${error.message}`);
    labelId = data.id;
  }

  const { error: aErr } = await client
    .from("agent_task_label_assignments")
    .upsert({ task_id: taskId, label_id: labelId, state: "suggested", suggested_by: "arc" }, { onConflict: "task_id,label_id" });
  if (aErr) throw new Error(`suggestLabel assignment failed: ${aErr.message}`);
  return { ok: true, labelId };
}
```

- [ ] **Step 5: Run tests + lint**

Run: `pnpm test src/lib/task-labels/__tests__/mutations.test.ts && npx eslint src/lib/task-labels`
Expected: PASS, eslint clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/task-labels/mutations.ts src/lib/task-labels/suggest.ts src/lib/task-labels/__tests__/mutations.test.ts
git commit -m "feat(labels): catalog mutations + agent suggest"
```

---

## Task 5: Operator server actions

**Files:**
- Create: `src/app/agent-operations/labels-actions.ts`

Thin `requireOperator()`-gated wrappers. Model on `src/app/agent-operations/actions.ts` (its `moveTaskAction` returns a serializable result; its create actions `revalidatePath`).

- [ ] **Step 1: Write the actions**

Create `src/app/agent-operations/labels-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import {
  acceptSuggestion,
  applyLabel,
  createLabel,
  deleteLabel,
  dismissSuggestion,
  recolorLabel,
  removeAssignment,
  renameLabel,
} from "@/lib/task-labels/mutations";

export type LabelActionResult = { ok: true } | { ok: false; message: string };

function refresh() {
  revalidatePath("/board");
  revalidatePath("/agent-operations");
}

export async function createAndApplyLabelAction(
  taskId: string,
  name: string,
  color: string,
): Promise<LabelActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  const created = await createLabel({ name, color });
  if (!created.ok) {
    const message =
      created.reason === "duplicate"
        ? "A label with that name already exists."
        : created.reason === "bad_color"
          ? "Pick a valid color."
          : "Enter a label name (max 40 characters).";
    return { ok: false, message };
  }
  await applyLabel(taskId, created.id);
  refresh();
  return { ok: true };
}

export async function applyLabelAction(taskId: string, labelId: string): Promise<LabelActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  await applyLabel(taskId, labelId);
  refresh();
  return { ok: true };
}

export async function removeLabelAction(taskId: string, labelId: string): Promise<LabelActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  await removeAssignment(taskId, labelId);
  refresh();
  return { ok: true };
}

export async function acceptSuggestionAction(taskId: string, labelId: string): Promise<LabelActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  await acceptSuggestion(taskId, labelId);
  refresh();
  return { ok: true };
}

export async function dismissSuggestionAction(taskId: string, labelId: string): Promise<LabelActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  await dismissSuggestion(taskId, labelId);
  refresh();
  return { ok: true };
}

export async function recolorLabelAction(labelId: string, color: string): Promise<LabelActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  await recolorLabel(labelId, color);
  refresh();
  return { ok: true };
}

export async function renameLabelAction(labelId: string, name: string): Promise<LabelActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  const result = await renameLabel(labelId, name);
  if (!result.ok) return { ok: false, message: "Enter a label name (max 40 characters)." };
  refresh();
  return { ok: true };
}

export async function deleteLabelAction(labelId: string): Promise<LabelActionResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  await deleteLabel(labelId);
  refresh();
  return { ok: true };
}
```

- [ ] **Step 2: Verify it type-checks (no non-async exports in a "use server" file)**

Run: `npx eslint src/app/agent-operations/labels-actions.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep labels-actions || echo "tsc clean"`
Expected: eslint clean, `tsc clean`. (Every export here is an `async function` — required for `"use server"`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/agent-operations/labels-actions.ts
git commit -m "feat(labels): operator-gated label server actions"
```

---

## Task 6: Agent API — list + suggest

**Files:**
- Create: `src/app/api/v1/arc/labels/route.ts`
- Create: `src/app/api/v1/arc/tasks/[id]/labels/suggest/route.ts`
- Test: `src/app/api/v1/arc/tasks/[id]/labels/suggest/route.test.ts`

Mirror `src/app/api/v1/arc/tasks/[id]/claim/route.ts`: `guard(request)` for bearer, `fail(...)` for errors, `parseJson` if present in `_lib/http.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/arc/tasks/[id]/labels/suggest/route.test.ts`. First open `claim/route.test.ts` to copy how it stubs the bearer + the `suggestLabel` dependency. Then:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/task-labels/suggest", () => ({
  suggestLabel: vi.fn(async () => ({ ok: true, labelId: "l9" })),
}));

import { POST } from "./route";

function req(body: unknown, token = "test-token") {
  return new Request("http://localhost/api/v1/arc/tasks/t1/labels/suggest", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST suggest label", () => {
  it("rejects without a valid bearer", async () => {
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "t1" }) });
    expect([401, 403]).toContain(res.status);
  });

  it("suggests for a valid request", async () => {
    process.env.ARC_AGENT_API_TOKEN = "test-token";
    const res = await POST(req({ name: "Weather", color: "blue" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(201);
  });
});
```

(Match the bearer env-var name and the exact `guard` behavior used by the sibling routes; adapt the auth assertion if `guard` returns a specific status.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test "src/app/api/v1/arc/tasks/[id]/labels/suggest/route.test.ts"`
Expected: FAIL — route not found.

- [ ] **Step 3: Write the GET catalog route**

Create `src/app/api/v1/arc/labels/route.ts`:

```ts
import { NextResponse } from "next/server";

import { fail, guard } from "@/app/api/v1/arc/_lib/http";
import { listLabels } from "@/lib/task-labels/read-model";

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const labels = await listLabels();
    return NextResponse.json({ ok: true, labels });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list labels.", 502);
  }
}
```

- [ ] **Step 4: Write the POST suggest route**

Create `src/app/api/v1/arc/tasks/[id]/labels/suggest/route.ts`:

```ts
import { NextResponse } from "next/server";

import { fail, guard } from "@/app/api/v1/arc/_lib/http";
import { isLabelColor } from "@/domain";
import { suggestLabel } from "@/lib/task-labels/suggest";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad_request", "Body must be JSON.", 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;

  let input: { labelId: string } | { name: string; color: string };
  if (typeof b.labelId === "string") {
    input = { labelId: b.labelId };
  } else if (typeof b.name === "string" && typeof b.color === "string") {
    if (!isLabelColor(b.color)) return fail("bad_request", "Unknown color.", 400);
    input = { name: b.name, color: b.color };
  } else {
    return fail("bad_request", "Provide { labelId } or { name, color }.", 400);
  }

  try {
    const result = await suggestLabel(id, input);
    if (!result.ok) {
      return result.reason === "not_found"
        ? fail("not_found", "No label with that id.", 404)
        : fail("rejected", `Invalid label (${result.reason}).`, 400);
    }
    return NextResponse.json({ ok: true, status: "suggested", labelId: result.labelId }, { status: 201 });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to suggest label.", 502);
  }
}
```

- [ ] **Step 5: Run test + lint**

Run: `pnpm test "src/app/api/v1/arc/tasks/[id]/labels/suggest/route.test.ts" && npx eslint "src/app/api/v1/arc/labels/route.ts" "src/app/api/v1/arc/tasks/[id]/labels/suggest/route.ts"`
Expected: PASS, eslint clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/v1/arc/labels/route.ts" "src/app/api/v1/arc/tasks/[id]/labels/suggest/route.ts" "src/app/api/v1/arc/tasks/[id]/labels/suggest/route.test.ts"
git commit -m "feat(labels): agent API to list catalog and suggest labels"
```

---

## Task 7: Wire labels into the board read-model

**Files:**
- Modify: `src/lib/agent-operations/read-model.ts`

Add `labels` to `AgentOperationsTask` and populate it in `getAgentOperationsDashboard`.

- [ ] **Step 1: Extend the type**

In `src/lib/agent-operations/read-model.ts`, add an import near the top:

```ts
import { type AssignedLabel, getLabelsForTasks } from "@/lib/task-labels/read-model";
```

Add `labels` to the `AgentOperationsTask` type (after `href`):

```ts
  href: string;
  labels: AssignedLabel[];
```

- [ ] **Step 2: Populate it in the dashboard**

In `getAgentOperationsDashboard`, after the `tasks` array is normalized (where `taskById` / the mapped task list is built) and before the `return { status: "live", ... }`, batch-load labels and attach. Find the line that builds the returned `tasks:` (currently `tasks: tasks.map((task) => mapTask(task, agentById, campaignById, approvalById))`) and replace it with a pre-computed, label-enriched array:

```ts
    const labelsByTask = await getLabelsForTasks(tasks.map((task) => task.id), supabase);
    const mappedTasks = tasks.map((task) => ({
      ...mapTask(task, agentById, campaignById, approvalById),
      labels: labelsByTask.get(task.id) ?? [],
    }));
```

Then use `mappedTasks` in the return object: `tasks: mappedTasks,`. Also update `mapTask` to include `labels: []` in its returned object literal (so the base mapper still satisfies the type when used elsewhere) — find `mapTask`'s `return { ... href: ... }` and add `labels: [],` before the closing brace.

- [ ] **Step 3: Verify build + tests**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "agent-operations/read-model|task-kanban" || echo "tsc clean"; pnpm test src/lib/agent-operations`
Expected: `tsc clean` (no errors in those files), existing read-model tests still pass. If a read-model test constructs `AgentOperationsTask` fixtures, add `labels: []` to them.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent-operations/read-model.ts
git commit -m "feat(labels): batch-load labels onto board tasks"
```

---

## Task 8: Label chip + picker components

**Files:**
- Create: `src/app/agent-operations/label-chip.tsx`
- Create: `src/app/agent-operations/label-picker.tsx`

- [ ] **Step 1: Create the color map + chip**

Create `src/app/agent-operations/label-chip.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { acceptSuggestionAction, dismissSuggestionAction, removeLabelAction } from "./labels-actions";
import { type AssignedLabel } from "@/lib/task-labels/read-model";

export const LABEL_TOKENS: Record<string, { bg: string; fg: string; border: string }> = {
  gold: { bg: "var(--accent-soft)", fg: "var(--accent-strong)", border: "var(--accent-border)" },
  green: { bg: "var(--ok-soft)", fg: "var(--ok-text)", border: "var(--ok-border)" },
  red: { bg: "var(--priority-soft)", fg: "var(--priority-text)", border: "var(--priority-border)" },
  amber: { bg: "var(--warn-soft)", fg: "var(--warn-text)", border: "var(--warn-border)" },
  blue: { bg: "rgba(36,86,166,0.16)", fg: "#9bbcf0", border: "rgba(36,86,166,0.5)" },
  teal: { bg: "var(--ok-soft)", fg: "var(--ok-text)", border: "var(--ok-border)" },
  slate: { bg: "var(--surface-raised)", fg: "var(--text-secondary)", border: "var(--border-panel)" },
  clay: { bg: "rgba(179,55,43,0.14)", fg: "#e0a3a3", border: "rgba(179,55,43,0.45)" },
};

export function LabelChip({ taskId, label }: { taskId: string; label: AssignedLabel }) {
  const router = useRouter();
  const [, start] = useTransition();
  const t = LABEL_TOKENS[label.color] ?? LABEL_TOKENS.slate;
  const suggested = label.state === "suggested";

  function act(fn: (taskId: string, labelId: string) => Promise<unknown>) {
    start(async () => {
      await fn(taskId, label.id);
      router.refresh();
    });
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold"
      style={{ background: suggested ? "transparent" : t.bg, color: t.fg, border: `1px ${suggested ? "dashed" : "solid"} ${t.border}` }}
    >
      {suggested ? <span title="Suggested by Arc">✦</span> : null}
      {label.name}
      {suggested ? (
        <>
          <button className="ml-0.5 hover:opacity-70" onClick={() => act(acceptSuggestionAction)} title="Accept" type="button">✓</button>
          <button className="hover:opacity-70" onClick={() => act(dismissSuggestionAction)} title="Dismiss" type="button">×</button>
        </>
      ) : (
        <button className="ml-0.5 opacity-0 transition group-hover:opacity-60 hover:!opacity-100" onClick={() => act(removeLabelAction)} title="Remove" type="button">×</button>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Create the picker**

Create `src/app/agent-operations/label-picker.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { applyLabelAction, createAndApplyLabelAction } from "./labels-actions";
import { LABEL_TOKENS } from "./label-chip";
import { type CatalogLabel } from "@/lib/task-labels/read-model";

const COLORS = ["gold", "green", "red", "amber", "blue", "teal", "slate", "clay"] as const;

export function LabelPicker({ taskId, catalog }: { taskId: string; catalog: CatalogLabel[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<string>("gold");
  const [, start] = useTransition();

  const matches = catalog.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase()));
  const exact = catalog.some((l) => l.name.toLowerCase() === query.trim().toLowerCase());

  function done() {
    setOpen(false);
    setQuery("");
    router.refresh();
  }

  return (
    <span className="relative inline-block">
      <button
        className="rounded border border-dashed border-[var(--border-panel)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)] hover:border-[var(--accent-border)] hover:text-[var(--text-secondary)]"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        + label
      </button>
      {open ? (
        <div className="absolute left-0 top-6 z-20 w-52 rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2 shadow-[var(--elev-raised)]">
          <input
            autoFocus
            className="mb-2 w-full rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 text-xs text-[var(--text-primary)]"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find or create…"
            value={query}
          />
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {matches.map((l) => (
              <button
                className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]"
                key={l.id}
                onClick={() => start(async () => { await applyLabelAction(taskId, l.id); done(); })}
                type="button"
              >
                {l.name}
              </button>
            ))}
            {query.trim() && !exact ? (
              <div className="border-t border-[var(--border-hairline)] pt-1">
                <div className="mb-1 flex gap-1">
                  {COLORS.map((c) => (
                    <button
                      aria-label={c}
                      className={`h-4 w-4 rounded ${color === c ? "ring-2 ring-[var(--accent)]" : ""}`}
                      key={c}
                      onClick={() => setColor(c)}
                      style={{ background: LABEL_TOKENS[c].fg }}
                      type="button"
                    />
                  ))}
                </div>
                <button
                  className="block w-full rounded px-1.5 py-1 text-left text-[11px] font-bold text-[var(--accent-strong)] hover:bg-[var(--surface-inset)]"
                  onClick={() => start(async () => { await createAndApplyLabelAction(taskId, query.trim(), color); done(); })}
                  type="button"
                >
                  Create “{query.trim()}”
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "label-chip|label-picker" || echo "tsc clean"; npx eslint src/app/agent-operations/label-chip.tsx src/app/agent-operations/label-picker.tsx`
Expected: `tsc clean`, eslint clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/agent-operations/label-chip.tsx src/app/agent-operations/label-picker.tsx
git commit -m "feat(labels): label chip + inline picker components"
```

---

## Task 9: Render chips + filter on the board

**Files:**
- Modify: `src/app/agent-operations/task-kanban-board.tsx`

The board already loads `task.labels` (Task 7). Render chips in the card meta row, add the picker, and add a label filter row. The board needs the catalog for the picker — pass it from the page.

- [ ] **Step 1: Accept a `catalog` prop and thread it through**

In `task-kanban-board.tsx`:
1. Import the new pieces at the top:
   ```tsx
   import { LabelChip } from "./label-chip";
   import { LabelPicker } from "./label-picker";
   import { type CatalogLabel } from "@/lib/task-labels/read-model";
   ```
2. Add `catalog` to the component props:
   ```tsx
   export function TaskKanbanBoard({ agents, tasks, catalog }: { agents: AgentOperationsAgent[]; tasks: AgentOperationsTask[]; catalog: CatalogLabel[] }) {
   ```
3. Add label-filter state next to `agentFilter`:
   ```tsx
   const [labelFilter, setLabelFilter] = useState<string[]>([]);
   ```
4. In the `visible` computation, also filter by labels (any-match on applied labels):
   ```tsx
   const visible = optimisticTasks.filter(
     (t) =>
       (agentFilter === "all" || t.agentKey === agentFilter) &&
       (labelFilter.length === 0 ||
         t.labels.some((l) => l.state === "applied" && labelFilter.includes(l.id))),
   );
   ```

- [ ] **Step 2: Add the label filter row**

In the toolbar `div` (the one holding the agent `<select>`), after the agent select, add a label filter chip row:

```tsx
{catalog.length > 0 ? (
  <div className="flex flex-wrap items-center gap-1">
    {catalog.map((l) => {
      const on = labelFilter.includes(l.id);
      return (
        <button
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${on ? "ring-1 ring-[var(--accent)]" : "opacity-60 hover:opacity-100"}`}
          key={l.id}
          onClick={() => setLabelFilter((prev) => (on ? prev.filter((x) => x !== l.id) : [...prev, l.id]))}
          style={{ background: "var(--surface-raised)", color: "var(--text-secondary)" }}
          type="button"
        >
          {l.name}
        </button>
      );
    })}
  </div>
) : null}
```

- [ ] **Step 3: Render chips + picker inside the card**

In the `Card` component's meta row (the `<div className="mt-2 flex flex-wrap ...">` that holds risk/campaign/outbound), append label chips and the picker. The `Card` needs `catalog` too — add it to `Card`'s props and pass it where `Card` is used (both the column map and the drag overlay):

```tsx
{task.labels.map((label) => (
  <LabelChip key={label.id} label={label} taskId={task.fullId} />
))}
{!overlay ? <LabelPicker catalog={catalog} taskId={task.fullId} /> : null}
```

Add `catalog: CatalogLabel[]` to the `Card` function's prop type and pass `catalog={catalog}` at both `<Card ... />` call sites.

- [ ] **Step 4: Pass the catalog from the pages**

In `src/app/board/page.tsx` and `src/app/agent-operations/page.tsx`, load the catalog and pass it to `BoardViewSwitch`. In each page (server component), import and call:

```tsx
import { listLabels } from "@/lib/task-labels/read-model";
// ...
const catalog = await listLabels();
// ...
<BoardViewSwitch agents={dashboard.agents} tasks={dashboard.tasks} catalog={catalog} />
```

And in `src/app/agent-operations/board-view-switch.tsx`, add `catalog: CatalogLabel[]` to its props and pass it down to `<TaskKanbanBoard ... catalog={catalog} />` (import the `CatalogLabel` type there too).

- [ ] **Step 5: Verify build + manual check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "agent-operations|board/page|board-view-switch" || echo "tsc clean"; pnpm lint && pnpm test`
Expected: `tsc clean`, lint clean, full suite green.

Manual (with the dev server): open `/board`. Confirm:
- A card shows its labels; the `+ label` picker opens, finds existing labels, and "Create '<name>'" adds a colored chip.
- The label filter row narrows the board.
- A `suggested` chip (insert one via the agent API or by temporarily calling `suggestLabel`) shows dashed with ✓/× that accept/dismiss.

- [ ] **Step 6: Commit**

```bash
git add src/app/agent-operations/task-kanban-board.tsx src/app/agent-operations/board-view-switch.tsx src/app/board/page.tsx src/app/agent-operations/page.tsx
git commit -m "feat(labels): render chips, inline picker, and label filter on the board"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** §3 data model → Task 1; §4 palette/normalization/validation → Task 2; §4 persistence (read-model, mutations, suggest) → Tasks 3–4; §4 server actions → Task 5; §6 agent API → Task 6; §5 read-model `labels` field → Task 7; §5 UI (chips, picker, filter) → Tasks 8–9; §8 multi-tenant (`workspace_id` nullable, `suggested_by`) → Task 1 + threaded as `null` defaults; §9 testing → Tasks 2,3,4,6. Phase B explicitly excluded (spec §10).
- **Type consistency:** `LABEL_COLORS`/`LabelColor`/`isLabelColor`/`validateNewLabel`/`normalizeLabelName`/`labelKey` (Task 2) used in Tasks 4 & 6. `CatalogLabel`/`AssignedLabel` defined in Task 3, consumed in Tasks 7,8,9. `suggestLabel`/`createLabel`/`acceptSuggestion`/`dismissSuggestion`/`applyLabel`/`removeAssignment` defined in Task 4, consumed in Tasks 5,6. Action names (`createAndApplyLabelAction`, `applyLabelAction`, `removeLabelAction`, `acceptSuggestionAction`, `dismissSuggestionAction`) consistent across Tasks 5,8.
- **`"use server"` safety:** `labels-actions.ts` exports only `async` functions (the exact bug that 500'd the app earlier) — verified in Task 5 Step 2.
- **Integration checks (verify at execution):** confirm `createSupabaseQueryMock`'s real API shape (Tasks 3–4) and the `_lib/http.ts` `guard`/`fail` signatures + bearer env var (Task 6) against the sibling files named in each task; confirm `mapTask`'s return object and any read-model test fixtures get `labels: []` (Task 7).
```
