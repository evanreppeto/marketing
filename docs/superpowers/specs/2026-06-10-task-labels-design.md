# Task Labels (Phase A) — Design

**Date:** 2026-06-10
**Status:** Approved design, pending implementation plan
**Author:** Evan Reppeto (with Claude)

## 1. Overview

Linear-style **labels** for the Arc task board: a reusable, colored label
catalog the operator curates, attached to task cards. Arc can
**suggest** labels — both existing ones and brand-new proposals — but nothing is
applied without operator acceptance.

This is **Phase A** of the larger "make the board customizable like Linear"
effort. **Phase B** (custom statuses/columns mapped to fixed agent categories)
is explicitly out of scope here and gets its own spec later. The key principle
that makes both phases safe for the agent: separate **human presentation**
(labels, custom names) from the **machine lifecycle** (the five
`agent_task_status` categories Arc's automation operates on). Labels are pure
human/agent metadata — they never change Arc's lifecycle behavior.

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Label granularity | **Reusable catalog** — labels are definitions (name + color) reused across cards |
| 2 | Arc's suggestion power | **Suggest existing AND propose new** labels; new ones stay `proposed` until the operator accepts |
| 3 | Management UI | **Inline only** — create/recolor/rename/delete from the board; no settings page |
| 4 | Color palette | Fixed 8: `gold, green, red, amber, blue, teal, slate, clay` (palette keys, not raw hex) |
| 5 | Filtering | Filter on **applied** labels only; suggestions are triage, not filter data |
| 6 | Control model | Operator-authored; Arc proposes, operator is always the gate |

## 3. Data model

Two new timestamp-prefixed migration tables (shipped migrations untouched).

### 3.1 `task_labels` (the catalog)
```
task_labels
  id           uuid pk default gen_random_uuid()
  workspace_id uuid null                 -- multi-tenant readiness; NULL today
  name         text not null check (length(btrim(name)) > 0)
  color        text not null             -- palette KEY (see 3.3), not hex
  status       text not null default 'active'  -- 'active' | 'proposed'
  created_at   timestamptz not null default now()
  updated_at   timestamptz not null default now()

  unique (workspace_id, lower(name))      -- case-insensitive uniqueness per workspace
  index on (workspace_id)
```
Operator-created labels are `active`. Arc-proposed new labels are `proposed`
until accepted (then flipped to `active`).

### 3.2 `agent_task_label_assignments` (catalog ↔ card)
```
agent_task_label_assignments
  id           uuid pk default gen_random_uuid()
  task_id      uuid not null references agent_tasks(id) on delete cascade
  label_id     uuid not null references task_labels(id) on delete cascade
  state        text not null default 'applied'  -- 'applied' | 'suggested'
  suggested_by text null                          -- 'arc' when state='suggested'
  created_at   timestamptz not null default now()

  unique (task_id, label_id)
```
The four cases this one model covers:
- **Operator applies an existing label:** assignment `state='applied'`.
- **Arc suggests an existing label:** assignment `state='suggested', suggested_by='arc'`.
- **Arc proposes a NEW label:** `task_labels` row `status='proposed'` + assignment `state='suggested', suggested_by='arc'`.
- **Operator accepts a suggestion:** label → `status='active'` (if it was proposed), assignment → `state='applied'`.

### 3.3 Color palette (DESIGN.md-compliant)
A fixed map of 8 palette keys → design tokens, in a shared module
(`src/domain/task-labels.ts`). No neon, no purple. The DB stores only the key;
the UI resolves the token, so labels recolor centrally and stay on-brand.

```
gold | green | red | amber | blue | teal | slate | clay
```

## 4. Layering (matches the app's convention)

- **`src/domain/task-labels.ts`** (pure, I/O-free, unit-tested):
  - `LABEL_PALETTE` (the 8 keys + token map) and `isLabelColor(key)`.
  - `normalizeLabelName(name)` — trim + collapse internal whitespace (display form) and a `labelKey(name)` lower-cased comparison form for dedup.
  - `validateNewLabel({ name, color })` → `{ ok: true } | { ok: false; reason }` (non-empty, length ≤ 40, valid color).
  - Suggestion-state helpers, e.g. `acceptanceResult(label, assignment)` describing the target `status`/`state` after accept.
- **`src/lib/task-labels/`** (I/O, `isSupabaseAdminConfigured()`-guarded):
  - `read-model.ts`: `listLabels(workspaceId?)` (catalog, `active` only for pickers), `getLabelsForTasks(taskIds)` → `Map<taskId, AssignedLabel[]>` for the board.
  - `mutations.ts`: `createLabel`, `renameLabel`, `recolorLabel`, `deleteLabel`, `applyLabel`, `removeAssignment`, `acceptSuggestion`, `dismissSuggestion`.
  - `suggest.ts`: `suggestLabel(taskId, { labelId } | { name, color })` — the agent path; resolves-or-creates a `proposed` label and inserts a `suggested` assignment. Idempotent on `(task_id, label_id)`.
- **Server actions** (`src/app/agent-operations/labels-actions.ts`, `requireOperator`-gated): thin wrappers over the mutations + `revalidatePath("/board")`, `"/agent-operations"`.
- **Agent API** (bearer): see §6.

## 5. UI (all inline, on the board)

- **`AssignedLabel` type** added to `AgentOperationsTask` via the read-model:
  `labels: Array<{ id; name; color; state: "applied" | "suggested"; suggestedBy: string | null }>`. Batch-loaded with `getLabelsForTasks` for the visible cards.
- **Card chips** (in the existing card meta row):
  - Applied = solid colored chip (palette token).
  - **Suggested = dashed outline chip** with a small Arc glyph and, on hover, **✓ accept / × dismiss**.
- **Label picker** (a `+` affordance on the card → popover): search existing
  `active` labels; or **"Create '<typed>'"** with a color swatch row → creates the
  catalog label and applies it in one step.
- **Manage** (small popover from a label chip): rename, recolor, delete.
- **Board filter:** a label-chip filter row (multi-select) above the columns;
  shows only cards carrying *all/any* selected **applied** labels (any-match v1).
- Components live alongside the board: `src/app/agent-operations/label-chip.tsx`,
  `label-picker.tsx`. Keep them small and focused.

## 6. Agent API (bearer-gated, lifecycle-safe)

- **`GET /api/v1/arc/labels`** → the `active` catalog (id, name, color). Lets
  Arc suggest *from your vocabulary*.
- **`POST /api/v1/arc/tasks/:id/labels/suggest`** → body `{ labelId }` (existing)
  or `{ name, color }` (propose new). Creates a **suggestion** only — never an
  applied label, never auto-creates an `active` label. Returns the resulting
  assignment. Outbound/approval state is untouched (consistent with the rest of
  the `/api/v1/arc/tasks` surface).

## 7. Suggestion flow (end to end)

1. Arc calls `GET /labels`, picks the best fit, calls `POST …/labels/suggest`
   (existing `labelId`) — or proposes `{ name, color }` for something new.
2. The card shows a **dashed suggested chip** (new proposals also create a
   `proposed` catalog label, invisible in pickers until accepted).
3. Operator **accepts** → label becomes `active` (if proposed), assignment
   becomes `applied`; the chip goes solid. Operator **dismisses** → assignment
   deleted; if the label was `proposed` and now unreferenced, it's deleted too.

## 8. Multi-tenant readiness (per the productization principle)

- `task_labels.workspace_id` ships nullable from day one (NULL = single tenant).
- No new hardcoded "Arc"/"Big Shoulders": the agent is just the `suggested_by`
  value; the catalog is workspace-scoped so each future customer curates their own.
- Domain functions are tenant-agnostic (operate on passed-in data).

## 9. Testing

- **Domain:** palette validity, `normalizeLabelName`/`labelKey` (whitespace,
  case), `validateNewLabel` (empty, too-long, bad color), acceptance helper.
- **Persistence:** create/dedup (case-insensitive unique), apply/remove,
  `suggestLabel` resolve-existing vs propose-new, accept (proposed→active),
  dismiss (cleans up orphan proposed label) — mocked Supabase.
- **Agent API:** bearer rejection; suggest-existing and propose-new happy paths;
  confirm it never creates an `active` label or applies directly.
- **Actions:** `requireOperator` gate on each.

## 10. Out of scope (Phase A)

- **Phase B:** custom statuses/columns mapped to fixed agent categories
  (separate spec). The five lifecycle columns stay fixed here.
- Label groups, label descriptions, per-label automation rules.
- A dedicated Settings management page (inline only for now).
- Filtering on suggested labels (applied-only in v1).

## 11. Open questions

None blocking. Board filter "any-match vs all-match" semantics default to
**any-match** in v1 and can be refined after use.
