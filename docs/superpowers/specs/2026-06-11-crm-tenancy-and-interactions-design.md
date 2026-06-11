# CRM Tenancy + Interaction Layer — Design (Spec 1 of 3)

**Date:** 2026-06-11
**Status:** Approved for planning
**Branch context:** `campaigns-redesign`

## Why this exists

The app already has a 6-object CRM (companies, contacts, properties, leads, jobs,
outcomes) with list and detail pages. Two things are missing that block it from
being (a) a working CRM and (b) a product other businesses can use:

1. **No interaction layer.** Detail pages are read-only. There is no place for a
   human *or* Hermes to add a note, log a call, or set a follow-up task against a
   specific record. The existing `src/lib/activity/read-model.ts` derives a feed
   by merging four audit tables, but it is read-only and not attached to any
   individual CRM record.
2. **No tenancy.** Every row implicitly belongs to Big Shoulders Restoration
   (BSR). To sell this to other service businesses, data must be isolated per
   organization.

This spec is the **foundation**. Two later specs build on it:

- **Spec 2 — CRM Cockpit:** dashboard (follow-ups due, high-score leads, pending
  approvals), global search, list filters/sort.
- **Spec 3 — AI Next-Best-Action:** `next_best_action`, `ai_summary`,
  `ai_score_reason`, recommendation panel, agent audit trail wired to Hermes.

## Guiding constraints

- **Approval-safe.** Nothing in this spec sends, publishes, or contacts anyone.
  Notes, tasks, and activities are internal records only. (CLAUDE.md
  non-negotiable: no outbound without human approval.)
- **Human vs. Hermes is always visible.** Every note/task/activity is attributed
  to `human`, `agent`, or `system`, plus an optional free-text name. No per-user
  login accounts in this spec.
- **Follow existing patterns:** `src/domain/` (pure) → `src/lib/<feature>/` (I/O)
  → `src/app/<route>/` (server components + actions). Guard every persistence
  call with `isSupabaseAdminConfigured()`. Gate every mutation with
  `requireOperator()`. Reuse `page-header.tsx` primitives and DESIGN.md.
- **Simple for non-technical users.** Plain language, badges for status, no
  jargon. Timeline / Notes / Tasks read like a CRM, not a database.

---

## A. Tenancy

### Data model

New table `public.organizations`:

| column | type | notes |
|--------|------|-------|
| `id` | uuid pk | `gen_random_uuid()` |
| `name` | text not null | check non-empty |
| `slug` | text not null unique | url-safe identifier |
| `status` | enum `org_status` (`active`, `suspended`, `archived`) | default `active` |
| `branding` | jsonb not null default `{}` | display_name, accent, etc. (minimal now) |
| `created_at` / `updated_at` | timestamptz | `set_updated_at` trigger |

Add to the 6 existing CRM tables (`companies`, `contacts`, `properties`, `leads`,
`jobs`, `outcomes`):

- `org_id uuid references public.organizations(id)`.
- Migration order: (1) create `organizations` + seed the BSR org, (2) add nullable
  `org_id`, (3) backfill all existing rows to the BSR org, (4) `alter column
  org_id set not null`, (5) add index `(org_id)` per table.

### Current-org resolution (the chokepoint)

The app queries Supabase with the **service-role admin client, which bypasses
RLS**. Therefore tenant isolation is enforced primarily in the application layer:

- New `src/lib/auth/org.ts` exporting `getCurrentOrgId(): Promise<string>`.
  - For now it resolves the single BSR org: read `DEFAULT_ORG_SLUG` (default
    `big-shoulders-restoration`) and look up its id, memoized per process.
  - Designed so a later spec swaps in session/subdomain resolution without
    touching call sites.
- Every interaction-layer read/write is scoped by `org_id`. CRM record
  reads/creates are stamped/filtered with the current org id.

### RLS (defense-in-depth)

Enable RLS on `organizations` and the interaction tables. Policies restrict rows
to `org_id = current_setting('app.current_org', true)::uuid` for non-service
roles. The service role bypasses these; they exist for any future anon/auth
direct access. Existing CRM tables keep current grants; adding restrictive
policies to them is deferred to avoid breaking current service-role reads —
documented as a known follow-up.

### Env

- `DEFAULT_ORG_SLUG` (optional, defaults to `big-shoulders-restoration`).

---

## B. Interaction layer

Three new tables. All are **org-scoped** and **polymorphic** via
`(entity_type, entity_id)`.

Shared enum `public.crm_entity_type`:
`company`, `contact`, `property`, `lead`, `job`, `outcome`, `campaign`.

Shared enum `public.actor_kind`: `human`, `agent`, `system`.

### `crm_notes`

| column | type | notes |
|--------|------|-------|
| `id` | uuid pk | |
| `org_id` | uuid not null fk | |
| `entity_type` | `crm_entity_type` not null | |
| `entity_id` | uuid not null | |
| `body` | text not null | plain text / markdown; check non-empty |
| `is_pinned` | bool not null default false | |
| `is_internal` | bool not null default false | label only; everything is internal in Spec 1 |
| `author_kind` | `actor_kind` not null | |
| `author_name` | text | optional free-text |
| `created_at` / `updated_at` | timestamptz | trigger |

### `crm_tasks`

| column | type | notes |
|--------|------|-------|
| `id` | uuid pk | |
| `org_id` | uuid not null fk | |
| `entity_type` | `crm_entity_type` | nullable — standalone tasks allowed |
| `entity_id` | uuid | nullable, paired with entity_type |
| `title` | text not null | check non-empty |
| `description` | text | |
| `due_at` | timestamptz | nullable |
| `priority` | enum `task_priority` (`low`, `normal`, `high`, `urgent`) | default `normal` |
| `status` | enum `task_status` (`open`, `in_progress`, `completed`, `canceled`) | default `open` |
| `assignee_kind` | `actor_kind` | nullable |
| `assignee_name` | text | nullable |
| `completed_at` | timestamptz | set when status → completed |
| `author_kind` | `actor_kind` not null | |
| `author_name` | text | |
| `created_at` / `updated_at` | timestamptz | trigger |

Constraint: if `entity_type` is set, `entity_id` must be set, and vice-versa.

### `crm_activities` (the timeline)

| column | type | notes |
|--------|------|-------|
| `id` | uuid pk | |
| `org_id` | uuid not null fk | |
| `entity_type` | `crm_entity_type` not null | |
| `entity_id` | uuid not null | |
| `activity_type` | enum `crm_activity_type` | see list below |
| `summary` | text not null | one-line, human-readable |
| `detail` | text | optional longer body |
| `actor_kind` | `actor_kind` not null | |
| `actor_name` | text | |
| `occurred_at` | timestamptz not null default now() | |
| `metadata` | jsonb not null default `{}` | e.g. `{ from_status, to_status, task_id, note_id }` |

`crm_activity_type` values: `note_added`, `status_changed`, `call_logged`,
`email_logged`, `sms_logged`, `meeting_logged`, `task_created`, `task_completed`,
`record_created`, `record_updated`, `ai_recommendation`, `approval_requested`,
`approval_decided`, `converted`, `file_added`.

Indexes on all three: `(org_id, entity_type, entity_id, <time> desc)`.

### Activity generation rules

- `addNote` → write note + `note_added` activity.
- `createTask` → write task + `task_created` activity.
- `completeTask` → update task + `task_completed` activity.
- `logActivity` → write a `*_logged` activity directly (call/email/sms/meeting).
- Manual notes/tasks are the Spec-1 writers. `status_changed` /
  `record_created/updated` hooks on the existing CRM write paths are a small,
  optional add; if low-risk we wire them, otherwise deferred to Spec 2.

---

## C. Code layers

### `src/domain/interactions.ts` (pure, no I/O, unit-tested)

- Types mirroring the tables (`CrmEntityType`, `ActorKind`, `NoteInput`,
  `TaskInput`, `ActivityInput`, `TaskPriority`, `TaskStatus`, etc.).
- `parseNoteInput`, `parseTaskInput`, `parseActivityInput` — validation +
  normalization (trim, reject empty body/title, validate enum membership,
  enforce the entity_type/entity_id pairing rule).
- `deriveTaskUrgency(dueAt, now)` → `overdue | due_today | upcoming | none`.
- `entityTypeFromCrmObjectKey(key)` — map `companies → company`, etc.
- Re-export through `src/domain/index.ts`.
- Tests in `src/domain/__tests__/interactions.test.ts`.

### `src/lib/interactions/`

- `persistence.ts` — `insertNote`, `insertTask`, `updateTaskStatus`,
  `insertActivity`. Each takes the validated domain input, calls
  `getCurrentOrgId()`, stamps `org_id`, writes via the admin client. Guarded by
  `isSupabaseAdminConfigured()`; degrades gracefully when unconfigured.
- `read-model.ts` — `getRecordTimeline(entityType, entityId)`,
  `getRecordNotes(...)`, `getRecordTasks(...)`. All org-scoped. Return shaped,
  presentation-ready rows (tone, urgency, relative-time-ready ISO, actor badge).

### `src/app/crm/interactions-actions.ts` (`"use server"`)

`addNoteAction`, `createTaskAction`, `completeTaskAction`, `logActivityAction`,
`pinNoteAction`. Each: `requireOperator()` → parse via domain → persist → write
companion activity → `revalidatePath` the record + list. Redirect with
`?action=…` feedback consistent with `crm/actions.ts`. **No outbound.**

### Hermes API surface

New bearer-gated `POST /api/v1/hermes/crm/interactions` (validated by
`checkBearerToken(request, "HERMES_AGENT_API_TOKEN")`). Body selects
`kind: note | task | activity` + payload; writes through the same
`src/lib/interactions/persistence.ts` with `author_kind = 'agent'`. This makes
the layer first-class for Hermes, not just the UI.

---

## D. UI

New components under `src/app/crm/_components/record-interactions/`:

- `RecordTimeline` — chronological list. Each row: small type icon, tone-colored
  dot (per `ActivityTone`), summary, actor badge (**Human** / **Hermes** /
  **System**), relative time. Empty state via `EmptyState`.
- `NotesPanel` — pinned notes first (pin glyph), then recent. Inline add-note
  form: textarea + "internal" toggle + submit. Pin/unpin button per note.
- `TasksPanel` — open tasks with due + priority badges; overdue rows highlighted
  (Restoration Red accent, sparingly). Inline create-task form (title, optional
  due date, priority). Complete checkbox.
- A compact action row (`Add note · Create task · Log activity`) at the top of
  each detail page.

Wire into `src/app/crm/_components/crm-record-page.tsx`, replacing the scaffold
"Locked record tools" panel. Reuse `Panel`, `StatusPill`, `EmptyState`,
`buttonClasses`, `ActionFeedback`. Follow DESIGN.md (Command Charcoal / Canvas
White / Restoration Red; no emojis; calm, not 3-equal-column).

---

## E. Migration

One new timestamped file `supabase/migrations/2026XXXXXXXXXX_crm_tenancy_and_interactions.sql`:

1. `org_status` enum + `organizations` table + `set_updated_at` trigger + seed
   the BSR org (`slug = big-shoulders-restoration`).
2. Add `org_id` to the 6 CRM tables (nullable → backfill → not null → index).
3. `crm_entity_type`, `actor_kind`, `task_priority`, `task_status`,
   `crm_activity_type` enums.
4. `crm_notes`, `crm_tasks`, `crm_activities` tables + indexes + `updated_at`
   triggers.
5. Enable RLS + defense-in-depth policies on `organizations` + the 3 new tables.
6. Grants consistent with existing migrations.

Do not edit shipped migrations. Migration must apply cleanly on a DB that already
has BSR data (backfill handles existing rows).

After the migration, **update `src/lib/supabase/database.types.ts`** (regenerate
via Supabase CLI if available, else hand-extend) so the new tables/columns/enums
are typed and `pnpm build` typechecks.

---

## F. Testing & verification

- Unit tests: `src/domain/__tests__/interactions.test.ts` — input parsing,
  enum/pairing validation, `deriveTaskUrgency` boundaries.
- `src/lib/interactions/read-model.test.ts` — shaping logic with a stubbed
  client (mirror `src/lib/crm/read-model.test.ts` style).
- Run: `pnpm test` (domain + lib), `pnpm lint` scoped to changed files
  (vendor noise per project memory), `pnpm build` (typecheck).
- Manual: a detail page shows Timeline/Notes/Tasks; adding a note appears in both
  Notes and Timeline; creating + completing a task updates Tasks + Timeline;
  Human vs. Hermes badges render.

---

## G. Out of scope (YAGNI — later specs)

Billing, public signup, per-user login/accounts/roles, real-time updates, file
upload storage (the `file_added` type only references existing storage paths),
rich-text editor, bulk operations, cross-record task inbox page (Spec 2),
dashboard (Spec 2), global search (Spec 2), AI next-best-action fields (Spec 3),
retrofitting restrictive RLS onto the 6 existing CRM tables.

## H. Risks / known follow-ups

- **Service-role bypasses RLS** — real isolation is the app-layer `org_id`
  scoping. Every new query must go through it; RLS is backup. Documented so it is
  not mistaken for the primary guard.
- **`database.types.ts` drift** — must be updated in lockstep with the migration
  or the build breaks (per project memory: lint does not typecheck).
- **Existing CRM reads are not yet org-scoped** beyond what this spec touches;
  Spec 2 should sweep remaining read paths as more orgs come online.
- **Prod migration is manual** (per project memory: Supabase migrations applied
  to prod DB by the BSR team, not via auto-deploy).
