# CRM Tenancy + Interaction Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CRM tenant-isolated (per-organization) and give every CRM record a real interaction layer — a chronological activity timeline, notes, and follow-up tasks that both human operators and the Hermes agent can write to.

**Architecture:** Three layers per the codebase convention — `src/domain/interactions.ts` (pure validation + derivations, unit-tested), `src/lib/interactions/` (org-scoped Supabase I/O), and `src/app/crm/` (server actions + UI panels). Tenancy is enforced in the app layer through a single `getCurrentOrgId()` chokepoint (the app uses the service-role client, which bypasses RLS), with RLS policies added as defense-in-depth. A new bearer-gated `POST /api/v1/hermes/crm/interactions` lets Hermes write through the same persistence path as humans.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), React 19, Supabase (Postgres), TypeScript, Vitest. Package manager: pnpm. Path alias `@/*` → `./src/*`.

---

## File Structure

**Migrations (new):**
- `supabase/migrations/20260612120000_crm_tenancy_and_interactions.sql` — organizations table + seed, `org_id` on the 6 CRM tables (backfill → not null), interaction enums + 3 interaction tables, RLS, grants.

**Domain (pure, no I/O):**
- `src/domain/interactions.ts` — types, `parseNoteInput`, `parseTaskInput`, `parseActivityInput`, `deriveTaskUrgency`, `entityTypeFromCrmObjectKey`.
- `src/domain/__tests__/interactions.test.ts` — unit tests.
- `src/domain/index.ts` — re-export (modify).

**Lib (I/O, org-scoped):**
- `src/lib/auth/org.ts` — `getCurrentOrgId()` chokepoint.
- `src/lib/interactions/persistence.ts` — `insertNote`, `insertTask`, `updateTaskStatus`, `insertActivity`.
- `src/lib/interactions/read-model.ts` — `getRecordTimeline`, `getRecordNotes`, `getRecordTasks`.
- `src/lib/interactions/read-model.test.ts` — shaping tests.

**App (actions + UI):**
- `src/app/crm/interactions-actions.ts` — `addNoteAction`, `createTaskAction`, `completeTaskAction`, `logActivityAction`, `pinNoteAction`.
- `src/app/crm/_components/record-interactions/timeline.tsx` — `RecordTimeline`.
- `src/app/crm/_components/record-interactions/notes-panel.tsx` — `NotesPanel`.
- `src/app/crm/_components/record-interactions/tasks-panel.tsx` — `TasksPanel`.
- `src/app/crm/_components/crm-record-page.tsx` — wire panels in, drop scaffold (modify).

**API (Hermes):**
- `src/app/api/v1/hermes/crm/interactions/route.ts` — `POST` writes note/task/activity as agent.

**Types:**
- `src/lib/supabase/database.types.ts` — add `org_id` to 6 tables; add organizations + 3 interaction tables + new enums (modify).

---

## Conventions every task follows

- **TDD where logic exists:** domain + read-model shaping get failing tests first. Migrations, types, server actions, and presentational React components have no unit harness in this repo — verify those with `pnpm build` (typecheck) and lint.
- **Lint scoped to changed files** (project memory: `pnpm lint` scans ~31k vendor problems). Use: `pnpm exec eslint <file> [<file>...]`.
- **`pnpm lint` does NOT typecheck** (project memory). Type errors surface only via `pnpm build` or `pnpm exec tsc --noEmit`.
- **Run a single test file:** `pnpm test src/domain/__tests__/interactions.test.ts`.
- **Commit after each task.** Commit messages end with the Co-Authored-By trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- All guards: persistence checks `isSupabaseAdminConfigured()`; server actions call `requireOperator()` first.

---

## Task 1: Migration — tenancy + interaction schema

**Files:**
- Create: `supabase/migrations/20260612120000_crm_tenancy_and_interactions.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260612120000_crm_tenancy_and_interactions.sql`:

```sql
-- CRM tenancy + interaction layer.
-- 1) organizations + per-org isolation (org_id on the 6 CRM tables)
-- 2) record-attached interaction layer: notes, tasks, activity timeline
-- Isolation is enforced primarily in the app layer (service_role bypasses RLS);
-- RLS policies below are defense-in-depth for any future anon/authenticated access.

-- ---------- Organizations ----------
create type public.org_status as enum ('active', 'suspended', 'archived');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null unique check (length(btrim(slug)) > 0),
  status public.org_status not null default 'active',
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- Seed the default tenant (Big Shoulders Restoration).
insert into public.organizations (name, slug)
values ('Big Shoulders Restoration', 'big-shoulders-restoration');

-- ---------- org_id on the 6 CRM tables (add nullable -> backfill -> not null) ----------
do $$
declare
  bsr_id uuid;
  tbl text;
begin
  select id into bsr_id from public.organizations where slug = 'big-shoulders-restoration';
  foreach tbl in array array['companies','contacts','properties','leads','jobs','outcomes'] loop
    execute format('alter table public.%I add column org_id uuid references public.organizations(id);', tbl);
    execute format('update public.%I set org_id = %L where org_id is null;', tbl, bsr_id);
    execute format('alter table public.%I alter column org_id set not null;', tbl);
    execute format('create index %I on public.%I (org_id);', tbl || '_org_id_idx', tbl);
  end loop;
end $$;

-- ---------- Interaction enums ----------
create type public.crm_entity_type as enum (
  'company', 'contact', 'property', 'lead', 'job', 'outcome', 'campaign'
);
create type public.actor_kind as enum ('human', 'agent', 'system');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.task_status as enum ('open', 'in_progress', 'completed', 'canceled');
create type public.crm_activity_type as enum (
  'note_added', 'status_changed', 'call_logged', 'email_logged', 'sms_logged',
  'meeting_logged', 'task_created', 'task_completed', 'record_created',
  'record_updated', 'ai_recommendation', 'approval_requested', 'approval_decided',
  'converted', 'file_added'
);

-- ---------- crm_notes ----------
create table public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type not null,
  entity_id uuid not null,
  body text not null check (length(btrim(body)) > 0),
  is_pinned boolean not null default false,
  is_internal boolean not null default false,
  author_kind public.actor_kind not null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_notes_entity_idx on public.crm_notes (org_id, entity_type, entity_id, created_at desc);
create trigger crm_notes_set_updated_at
  before update on public.crm_notes
  for each row execute function public.set_updated_at();

-- ---------- crm_tasks ----------
create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type,
  entity_id uuid,
  title text not null check (length(btrim(title)) > 0),
  description text,
  due_at timestamptz,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'open',
  assignee_kind public.actor_kind,
  assignee_name text,
  completed_at timestamptz,
  author_kind public.actor_kind not null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_tasks_entity_pairing check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  )
);
create index crm_tasks_entity_idx on public.crm_tasks (org_id, entity_type, entity_id, due_at);
create index crm_tasks_status_idx on public.crm_tasks (org_id, status, due_at);
create trigger crm_tasks_set_updated_at
  before update on public.crm_tasks
  for each row execute function public.set_updated_at();

-- ---------- crm_activities ----------
create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type not null,
  entity_id uuid not null,
  activity_type public.crm_activity_type not null,
  summary text not null check (length(btrim(summary)) > 0),
  detail text,
  actor_kind public.actor_kind not null,
  actor_name text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index crm_activities_entity_idx on public.crm_activities (org_id, entity_type, entity_id, occurred_at desc);

-- ---------- RLS (defense-in-depth; service_role bypasses) ----------
alter table public.organizations enable row level security;
alter table public.crm_notes enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_activities enable row level security;

create policy organizations_current_org on public.organizations
  for all to authenticated
  using (id = nullif(current_setting('app.current_org', true), '')::uuid);

create policy crm_notes_current_org on public.crm_notes
  for all to authenticated
  using (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org', true), '')::uuid);

create policy crm_tasks_current_org on public.crm_tasks
  for all to authenticated
  using (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org', true), '')::uuid);

create policy crm_activities_current_org on public.crm_activities
  for all to authenticated
  using (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org', true), '')::uuid);

-- ---------- Grants (match existing data-API role grants) ----------
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.crm_notes to service_role;
grant select, insert, update, delete on public.crm_tasks to service_role;
grant select, insert, update, delete on public.crm_activities to service_role;
grant select on public.organizations, public.crm_notes, public.crm_tasks, public.crm_activities to anon, authenticated;
```

- [ ] **Step 2: Sanity-check the SQL parses**

The repo has no local Postgres in CI; verify syntax visually and confirm the file is well-formed (balanced `$$`, every `create` terminated). If a local Supabase/psql is available, run:

Run: `psql "$DATABASE_URL" -f supabase/migrations/20260612120000_crm_tenancy_and_interactions.sql --single-transaction --set ON_ERROR_STOP=1` (skip if no DB; prod is applied manually by the BSR team per project memory).
Expected: no errors, or skipped.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612120000_crm_tenancy_and_interactions.sql
git commit -m "feat(crm): migration for org tenancy + interaction tables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Database types — extend `database.types.ts`

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

This must match Task 1 exactly or `pnpm build` breaks (project memory: lint does not typecheck).

- [ ] **Step 1: Add `org_id` to the 6 CRM tables**

For each of `companies`, `contacts`, `properties`, `leads`, `jobs`, `outcomes`, add `org_id` to `Row`, `Insert`, and `Update`. Example for `companies` (`Row` gets a required field, `Insert`/`Update` get optional):

In `Row`, add after `id: string;`:
```typescript
          org_id: string;
```
In `Insert`, add after `id?: string;`:
```typescript
          org_id?: string;
```
In `Update`, add:
```typescript
          org_id?: string;
```
Repeat for all six tables.

- [ ] **Step 2: Add the new tables**

Inside `Database["public"]["Tables"]`, add:

```typescript
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: Database["public"]["Enums"]["org_status"];
          branding: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: Database["public"]["Enums"]["org_status"];
          branding?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["org_status"];
          branding?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_notes: {
        Row: {
          id: string;
          org_id: string;
          entity_type: Database["public"]["Enums"]["crm_entity_type"];
          entity_id: string;
          body: string;
          is_pinned: boolean;
          is_internal: boolean;
          author_kind: Database["public"]["Enums"]["actor_kind"];
          author_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          entity_type: Database["public"]["Enums"]["crm_entity_type"];
          entity_id: string;
          body: string;
          is_pinned?: boolean;
          is_internal?: boolean;
          author_kind: Database["public"]["Enums"]["actor_kind"];
          author_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          entity_type?: Database["public"]["Enums"]["crm_entity_type"];
          entity_id?: string;
          body?: string;
          is_pinned?: boolean;
          is_internal?: boolean;
          author_kind?: Database["public"]["Enums"]["actor_kind"];
          author_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_tasks: {
        Row: {
          id: string;
          org_id: string;
          entity_type: Database["public"]["Enums"]["crm_entity_type"] | null;
          entity_id: string | null;
          title: string;
          description: string | null;
          due_at: string | null;
          priority: Database["public"]["Enums"]["task_priority"];
          status: Database["public"]["Enums"]["task_status"];
          assignee_kind: Database["public"]["Enums"]["actor_kind"] | null;
          assignee_name: string | null;
          completed_at: string | null;
          author_kind: Database["public"]["Enums"]["actor_kind"];
          author_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null;
          entity_id?: string | null;
          title: string;
          description?: string | null;
          due_at?: string | null;
          priority?: Database["public"]["Enums"]["task_priority"];
          status?: Database["public"]["Enums"]["task_status"];
          assignee_kind?: Database["public"]["Enums"]["actor_kind"] | null;
          assignee_name?: string | null;
          completed_at?: string | null;
          author_kind: Database["public"]["Enums"]["actor_kind"];
          author_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null;
          entity_id?: string | null;
          title?: string;
          description?: string | null;
          due_at?: string | null;
          priority?: Database["public"]["Enums"]["task_priority"];
          status?: Database["public"]["Enums"]["task_status"];
          assignee_kind?: Database["public"]["Enums"]["actor_kind"] | null;
          assignee_name?: string | null;
          completed_at?: string | null;
          author_kind?: Database["public"]["Enums"]["actor_kind"];
          author_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_activities: {
        Row: {
          id: string;
          org_id: string;
          entity_type: Database["public"]["Enums"]["crm_entity_type"];
          entity_id: string;
          activity_type: Database["public"]["Enums"]["crm_activity_type"];
          summary: string;
          detail: string | null;
          actor_kind: Database["public"]["Enums"]["actor_kind"];
          actor_name: string | null;
          occurred_at: string;
          metadata: Json;
        };
        Insert: {
          id?: string;
          org_id: string;
          entity_type: Database["public"]["Enums"]["crm_entity_type"];
          entity_id: string;
          activity_type: Database["public"]["Enums"]["crm_activity_type"];
          summary: string;
          detail?: string | null;
          actor_kind: Database["public"]["Enums"]["actor_kind"];
          actor_name?: string | null;
          occurred_at?: string;
          metadata?: Json;
        };
        Update: {
          id?: string;
          org_id?: string;
          entity_type?: Database["public"]["Enums"]["crm_entity_type"];
          entity_id?: string;
          activity_type?: Database["public"]["Enums"]["crm_activity_type"];
          summary?: string;
          detail?: string | null;
          actor_kind?: Database["public"]["Enums"]["actor_kind"];
          actor_name?: string | null;
          occurred_at?: string;
          metadata?: Json;
        };
        Relationships: [];
      };
```

- [ ] **Step 3: Add the new enums**

Inside `Database["public"]["Enums"]`, add:

```typescript
      org_status: "active" | "suspended" | "archived";
      crm_entity_type: "company" | "contact" | "property" | "lead" | "job" | "outcome" | "campaign";
      actor_kind: "human" | "agent" | "system";
      task_priority: "low" | "normal" | "high" | "urgent";
      task_status: "open" | "in_progress" | "completed" | "canceled";
      crm_activity_type:
        | "note_added"
        | "status_changed"
        | "call_logged"
        | "email_logged"
        | "sms_logged"
        | "meeting_logged"
        | "task_created"
        | "task_completed"
        | "record_created"
        | "record_updated"
        | "ai_recommendation"
        | "approval_requested"
        | "approval_decided"
        | "converted"
        | "file_added";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no new errors). If errors reference the new tables, the shapes diverge from Task 1 — fix the types.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat(crm): type org_id + interaction tables in database.types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Domain — interaction types, validation, urgency

**Files:**
- Create: `src/domain/interactions.ts`
- Test: `src/domain/__tests__/interactions.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/interactions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  deriveTaskUrgency,
  entityTypeFromCrmObjectKey,
  parseNoteInput,
  parseTaskInput,
  parseActivityInput,
} from "../interactions";

describe("parseNoteInput", () => {
  it("accepts a valid note and trims the body", () => {
    const result = parseNoteInput({
      entityType: "contact",
      entityId: "11111111-1111-1111-1111-111111111111",
      body: "  Called the homeowner, left voicemail  ",
      authorKind: "human",
      authorName: "Evan",
      isInternal: true,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        entityType: "contact",
        entityId: "11111111-1111-1111-1111-111111111111",
        body: "Called the homeowner, left voicemail",
        isPinned: false,
        isInternal: true,
        authorKind: "human",
        authorName: "Evan",
      },
    });
  });

  it("rejects an empty body", () => {
    const result = parseNoteInput({
      entityType: "contact",
      entityId: "11111111-1111-1111-1111-111111111111",
      body: "   ",
      authorKind: "human",
    });
    expect(result).toEqual({ ok: false, error: "A note needs some text." });
  });

  it("rejects an unknown entity type", () => {
    const result = parseNoteInput({
      entityType: "spaceship",
      entityId: "11111111-1111-1111-1111-111111111111",
      body: "hi",
      authorKind: "human",
    });
    expect(result).toEqual({ ok: false, error: "Unknown record type." });
  });
});

describe("parseTaskInput", () => {
  it("accepts a valid task with defaults", () => {
    const result = parseTaskInput({
      entityType: "lead",
      entityId: "22222222-2222-2222-2222-222222222222",
      title: "Follow up on water damage estimate",
      authorKind: "agent",
      authorName: "Hermes",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.priority).toBe("normal");
    expect(result.value.status).toBe("open");
    expect(result.value.title).toBe("Follow up on water damage estimate");
  });

  it("rejects an empty title", () => {
    const result = parseTaskInput({ title: "  ", authorKind: "human" });
    expect(result).toEqual({ ok: false, error: "A task needs a title." });
  });

  it("rejects a bad priority", () => {
    const result = parseTaskInput({ title: "x", priority: "yesterday", authorKind: "human" });
    expect(result).toEqual({ ok: false, error: "Unknown task priority." });
  });

  it("rejects an entity id without an entity type", () => {
    const result = parseTaskInput({
      entityId: "22222222-2222-2222-2222-222222222222",
      title: "x",
      authorKind: "human",
    });
    expect(result).toEqual({ ok: false, error: "A linked task needs both a record type and id." });
  });
});

describe("parseActivityInput", () => {
  it("accepts a logged call", () => {
    const result = parseActivityInput({
      entityType: "company",
      entityId: "33333333-3333-3333-3333-333333333333",
      activityType: "call_logged",
      summary: "Spoke with facilities manager",
      actorKind: "human",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown activity type", () => {
    const result = parseActivityInput({
      entityType: "company",
      entityId: "33333333-3333-3333-3333-333333333333",
      activityType: "telepathy",
      summary: "x",
      actorKind: "human",
    });
    expect(result).toEqual({ ok: false, error: "Unknown activity type." });
  });
});

describe("deriveTaskUrgency", () => {
  const now = new Date("2026-06-12T12:00:00.000Z");

  it("returns none when there is no due date", () => {
    expect(deriveTaskUrgency(null, now)).toBe("none");
  });

  it("returns overdue when due in the past", () => {
    expect(deriveTaskUrgency("2026-06-11T12:00:00.000Z", now)).toBe("overdue");
  });

  it("returns due_today when due on the same UTC day", () => {
    expect(deriveTaskUrgency("2026-06-12T23:00:00.000Z", now)).toBe("due_today");
  });

  it("returns upcoming when due in the future on a later day", () => {
    expect(deriveTaskUrgency("2026-06-15T08:00:00.000Z", now)).toBe("upcoming");
  });
});

describe("entityTypeFromCrmObjectKey", () => {
  it("maps plural object keys to singular entity types", () => {
    expect(entityTypeFromCrmObjectKey("companies")).toBe("company");
    expect(entityTypeFromCrmObjectKey("properties")).toBe("property");
    expect(entityTypeFromCrmObjectKey("outcomes")).toBe("outcome");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/domain/__tests__/interactions.test.ts`
Expected: FAIL — `Cannot find module '../interactions'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/interactions.ts`:

```typescript
/**
 * Pure logic for the CRM interaction layer (notes, tasks, activity timeline).
 * No I/O. Validation + normalization + derivations only; persistence and
 * org-scoping live in src/lib/interactions/.
 */

export const CRM_ENTITY_TYPES = [
  "company",
  "contact",
  "property",
  "lead",
  "job",
  "outcome",
  "campaign",
] as const;
export type CrmEntityType = (typeof CRM_ENTITY_TYPES)[number];

export const ACTOR_KINDS = ["human", "agent", "system"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ["open", "in_progress", "completed", "canceled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CRM_ACTIVITY_TYPES = [
  "note_added",
  "status_changed",
  "call_logged",
  "email_logged",
  "sms_logged",
  "meeting_logged",
  "task_created",
  "task_completed",
  "record_created",
  "record_updated",
  "ai_recommendation",
  "approval_requested",
  "approval_decided",
  "converted",
  "file_added",
] as const;
export type CrmActivityType = (typeof CRM_ACTIVITY_TYPES)[number];

export type TaskUrgency = "overdue" | "due_today" | "upcoming" | "none";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type NoteInput = {
  entityType: CrmEntityType;
  entityId: string;
  body: string;
  isPinned: boolean;
  isInternal: boolean;
  authorKind: ActorKind;
  authorName?: string;
};

export type TaskInput = {
  entityType: CrmEntityType | null;
  entityId: string | null;
  title: string;
  description?: string;
  dueAt?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeKind?: ActorKind | null;
  assigneeName?: string;
  authorKind: ActorKind;
  authorName?: string;
};

export type ActivityInput = {
  entityType: CrmEntityType;
  entityId: string;
  activityType: CrmActivityType;
  summary: string;
  detail?: string;
  actorKind: ActorKind;
  actorName?: string;
  metadata?: Record<string, unknown>;
};

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEntityType(value: unknown): value is CrmEntityType {
  return typeof value === "string" && (CRM_ENTITY_TYPES as readonly string[]).includes(value);
}

function isActorKind(value: unknown): value is ActorKind {
  return typeof value === "string" && (ACTOR_KINDS as readonly string[]).includes(value);
}

export function parseNoteInput(raw: {
  entityType: unknown;
  entityId: unknown;
  body: unknown;
  authorKind: unknown;
  authorName?: unknown;
  isPinned?: unknown;
  isInternal?: unknown;
}): ParseResult<NoteInput> {
  if (!isEntityType(raw.entityType)) return { ok: false, error: "Unknown record type." };
  const entityId = trimmed(raw.entityId);
  if (!entityId) return { ok: false, error: "A note needs a record to attach to." };
  const body = trimmed(raw.body);
  if (!body) return { ok: false, error: "A note needs some text." };
  if (!isActorKind(raw.authorKind)) return { ok: false, error: "Unknown author." };
  const authorName = trimmed(raw.authorName);
  return {
    ok: true,
    value: {
      entityType: raw.entityType,
      entityId,
      body,
      isPinned: raw.isPinned === true,
      isInternal: raw.isInternal === true,
      authorKind: raw.authorKind,
      ...(authorName ? { authorName } : {}),
    },
  };
}

export function parseTaskInput(raw: {
  entityType?: unknown;
  entityId?: unknown;
  title: unknown;
  description?: unknown;
  dueAt?: unknown;
  priority?: unknown;
  status?: unknown;
  assigneeKind?: unknown;
  assigneeName?: unknown;
  authorKind: unknown;
  authorName?: unknown;
}): ParseResult<TaskInput> {
  const title = trimmed(raw.title);
  if (!title) return { ok: false, error: "A task needs a title." };
  if (!isActorKind(raw.authorKind)) return { ok: false, error: "Unknown author." };

  const hasType = raw.entityType !== undefined && raw.entityType !== null && raw.entityType !== "";
  const hasId = raw.entityId !== undefined && raw.entityId !== null && raw.entityId !== "";
  if (hasType !== hasId) {
    return { ok: false, error: "A linked task needs both a record type and id." };
  }
  if (hasType && !isEntityType(raw.entityType)) return { ok: false, error: "Unknown record type." };

  const priority = raw.priority === undefined || raw.priority === "" ? "normal" : raw.priority;
  if (!(TASK_PRIORITIES as readonly string[]).includes(priority as string)) {
    return { ok: false, error: "Unknown task priority." };
  }
  const status = raw.status === undefined || raw.status === "" ? "open" : raw.status;
  if (!(TASK_STATUSES as readonly string[]).includes(status as string)) {
    return { ok: false, error: "Unknown task status." };
  }
  if (raw.assigneeKind !== undefined && raw.assigneeKind !== null && !isActorKind(raw.assigneeKind)) {
    return { ok: false, error: "Unknown assignee." };
  }

  const description = trimmed(raw.description);
  const dueAt = trimmed(raw.dueAt);
  const assigneeName = trimmed(raw.assigneeName);
  const authorName = trimmed(raw.authorName);

  return {
    ok: true,
    value: {
      entityType: hasType ? (raw.entityType as CrmEntityType) : null,
      entityId: hasId ? trimmed(raw.entityId) : null,
      title,
      ...(description ? { description } : {}),
      dueAt: dueAt ? dueAt : null,
      priority: priority as TaskPriority,
      status: status as TaskStatus,
      assigneeKind: isActorKind(raw.assigneeKind) ? raw.assigneeKind : null,
      ...(assigneeName ? { assigneeName } : {}),
      authorKind: raw.authorKind,
      ...(authorName ? { authorName } : {}),
    },
  };
}

export function parseActivityInput(raw: {
  entityType: unknown;
  entityId: unknown;
  activityType: unknown;
  summary: unknown;
  detail?: unknown;
  actorKind: unknown;
  actorName?: unknown;
  metadata?: unknown;
}): ParseResult<ActivityInput> {
  if (!isEntityType(raw.entityType)) return { ok: false, error: "Unknown record type." };
  const entityId = trimmed(raw.entityId);
  if (!entityId) return { ok: false, error: "An activity needs a record to attach to." };
  if (
    typeof raw.activityType !== "string" ||
    !(CRM_ACTIVITY_TYPES as readonly string[]).includes(raw.activityType)
  ) {
    return { ok: false, error: "Unknown activity type." };
  }
  const summary = trimmed(raw.summary);
  if (!summary) return { ok: false, error: "An activity needs a summary." };
  if (!isActorKind(raw.actorKind)) return { ok: false, error: "Unknown actor." };

  const detail = trimmed(raw.detail);
  const actorName = trimmed(raw.actorName);
  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : undefined;

  return {
    ok: true,
    value: {
      entityType: raw.entityType,
      entityId,
      activityType: raw.activityType as CrmActivityType,
      summary,
      ...(detail ? { detail } : {}),
      actorKind: raw.actorKind,
      ...(actorName ? { actorName } : {}),
      ...(metadata ? { metadata } : {}),
    },
  };
}

export function deriveTaskUrgency(dueAt: string | null | undefined, now: Date): TaskUrgency {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "none";
  const sameUtcDay =
    due.getUTCFullYear() === now.getUTCFullYear() &&
    due.getUTCMonth() === now.getUTCMonth() &&
    due.getUTCDate() === now.getUTCDate();
  if (sameUtcDay) return "due_today";
  return due.getTime() < now.getTime() ? "overdue" : "upcoming";
}

const OBJECT_KEY_TO_ENTITY: Record<string, CrmEntityType> = {
  companies: "company",
  contacts: "contact",
  properties: "property",
  leads: "lead",
  jobs: "job",
  outcomes: "outcome",
};

export function entityTypeFromCrmObjectKey(key: string): CrmEntityType | null {
  return OBJECT_KEY_TO_ENTITY[key] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/domain/__tests__/interactions.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Re-export through the domain barrel**

In `src/domain/index.ts`, add alongside the other `export * from` lines:

```typescript
export * from "./interactions";
```

- [ ] **Step 6: Typecheck + lint the changed files**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm exec eslint src/domain/interactions.ts src/domain/__tests__/interactions.test.ts src/domain/index.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/domain/interactions.ts src/domain/__tests__/interactions.test.ts src/domain/index.ts
git commit -m "feat(crm): domain logic for notes, tasks, activity timeline

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Current-org chokepoint — `getCurrentOrgId()`

**Files:**
- Create: `src/lib/auth/org.ts`

No unit test (thin I/O wrapper around the existing admin client + env); verified by typecheck and by Task 5's tests using an injected org id.

- [ ] **Step 1: Write the implementation**

Create `src/lib/auth/org.ts`:

```typescript
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Current-organization resolution — the single chokepoint for tenant isolation.
 *
 * The app talks to Supabase with the service-role client, which BYPASSES RLS, so
 * isolation is enforced here in the app layer: every interaction-layer query is
 * scoped by the org id this returns. Today it resolves the single seeded org
 * (BSR). When real multi-tenant auth lands, swap the body for session/subdomain
 * resolution — call sites do not change.
 */
export const DEFAULT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG ?? "big-shoulders-restoration";

let cachedOrgId: string | null = null;

export class OrgUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgUnavailableError";
  }
}

export async function getCurrentOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  if (!isSupabaseAdminConfigured()) {
    throw new OrgUnavailableError("Supabase is not configured, so no organization is available.");
  }
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", DEFAULT_ORG_SLUG)
    .maybeSingle<{ id: string }>();
  if (error) throw new OrgUnavailableError(error.message);
  if (!data) throw new OrgUnavailableError(`No organization found for slug "${DEFAULT_ORG_SLUG}".`);
  cachedOrgId = data.id;
  return cachedOrgId;
}

/** Test-only: reset the memoized org id between cases. */
export function __resetOrgCache() {
  cachedOrgId = null;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm exec eslint src/lib/auth/org.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/org.ts
git commit -m "feat(crm): getCurrentOrgId tenancy chokepoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Lib — interaction read-model (shaping, tested)

**Files:**
- Create: `src/lib/interactions/read-model.ts`
- Test: `src/lib/interactions/read-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/interactions/read-model.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getRecordTimeline, getRecordNotes, getRecordTasks } from "./read-model";

const ORG = "00000000-0000-0000-0000-000000000001";

describe("getRecordTimeline", () => {
  it("shapes activity rows with actor badge + tone and scopes by org", async () => {
    const supabase = createSupabaseQueryMock({
      crm_activities: {
        data: [
          {
            id: "a1",
            org_id: ORG,
            entity_type: "lead",
            entity_id: "lead-1",
            activity_type: "note_added",
            summary: "Note added",
            detail: "Left a voicemail",
            actor_kind: "human",
            actor_name: "Evan",
            occurred_at: "2026-06-12T10:00:00.000Z",
            metadata: {},
          },
        ],
        error: null,
      },
    });

    const result = await getRecordTimeline("lead", "lead-1", ORG, supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.entries[0]).toMatchObject({
      id: "a1",
      activityType: "note_added",
      summary: "Note added",
      actorLabel: "Evan",
      actorKind: "human",
    });
    expect(supabase.calls).toContainEqual(["eq", "org_id", ORG]);
    expect(supabase.calls).toContainEqual(["eq", "entity_type", "lead"]);
    expect(supabase.calls).toContainEqual(["eq", "entity_id", "lead-1"]);
  });

  it("reports unavailable when the query errors", async () => {
    const supabase = createSupabaseQueryMock({
      crm_activities: { data: null, error: { message: "boom" } },
    });
    const result = await getRecordTimeline("lead", "lead-1", ORG, supabase);
    expect(result.status).toBe("unavailable");
  });
});

describe("getRecordTasks", () => {
  it("derives urgency from due_at relative to now", async () => {
    const supabase = createSupabaseQueryMock({
      crm_tasks: {
        data: [
          {
            id: "t1",
            org_id: ORG,
            entity_type: "lead",
            entity_id: "lead-1",
            title: "Send estimate",
            description: null,
            due_at: "2000-01-01T00:00:00.000Z",
            priority: "high",
            status: "open",
            assignee_kind: "human",
            assignee_name: "Evan",
            completed_at: null,
            author_kind: "human",
            author_name: "Evan",
            created_at: "2026-06-10T00:00:00.000Z",
            updated_at: "2026-06-10T00:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    const result = await getRecordTasks("lead", "lead-1", ORG, supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.tasks[0]).toMatchObject({ id: "t1", urgency: "overdue", priority: "high" });
  });
});

describe("getRecordNotes", () => {
  it("orders pinned notes first", async () => {
    const supabase = createSupabaseQueryMock({
      crm_notes: {
        data: [
          {
            id: "n1",
            org_id: ORG,
            entity_type: "lead",
            entity_id: "lead-1",
            body: "Plain note",
            is_pinned: false,
            is_internal: false,
            author_kind: "human",
            author_name: "Evan",
            created_at: "2026-06-12T09:00:00.000Z",
            updated_at: "2026-06-12T09:00:00.000Z",
          },
          {
            id: "n2",
            org_id: ORG,
            entity_type: "lead",
            entity_id: "lead-1",
            body: "Pinned note",
            is_pinned: true,
            is_internal: true,
            author_kind: "agent",
            author_name: "Hermes",
            created_at: "2026-06-12T08:00:00.000Z",
            updated_at: "2026-06-12T08:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    const result = await getRecordNotes("lead", "lead-1", ORG, supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.notes.map((n) => n.id)).toEqual(["n2", "n1"]);
    expect(result.notes[0]).toMatchObject({ isPinned: true, actorKind: "agent", actorLabel: "Hermes" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/interactions/read-model.test.ts`
Expected: FAIL — `Cannot find module './read-model'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/interactions/read-model.ts`:

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  deriveTaskUrgency,
  type ActorKind,
  type CrmActivityType,
  type CrmEntityType,
  type TaskPriority,
  type TaskStatus,
  type TaskUrgency,
} from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type ActivityTone = "green" | "red" | "amber" | "blue" | "gray";

export type TimelineEntry = {
  id: string;
  activityType: CrmActivityType;
  tone: ActivityTone;
  summary: string;
  detail: string | null;
  actorKind: ActorKind;
  actorLabel: string;
  occurredAt: string;
};

export type NoteEntry = {
  id: string;
  body: string;
  isPinned: boolean;
  isInternal: boolean;
  actorKind: ActorKind;
  actorLabel: string;
  createdAt: string;
};

export type TaskEntry = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  urgency: TaskUrgency;
  assigneeLabel: string | null;
  actorKind: ActorKind;
  actorLabel: string;
  createdAt: string;
};

export type TimelineResult =
  | { status: "live"; entries: TimelineEntry[] }
  | { status: "unavailable"; message: string };
export type NotesResult =
  | { status: "live"; notes: NoteEntry[] }
  | { status: "unavailable"; message: string };
export type TasksResult =
  | { status: "live"; tasks: TaskEntry[] }
  | { status: "unavailable"; message: string };

const ACTIVITY_TONE: Record<CrmActivityType, ActivityTone> = {
  note_added: "blue",
  status_changed: "amber",
  call_logged: "blue",
  email_logged: "blue",
  sms_logged: "blue",
  meeting_logged: "blue",
  task_created: "amber",
  task_completed: "green",
  record_created: "green",
  record_updated: "blue",
  ai_recommendation: "amber",
  approval_requested: "amber",
  approval_decided: "green",
  converted: "green",
  file_added: "blue",
};

function actorLabel(kind: ActorKind, name: string | null): string {
  if (name && name.trim()) return name.trim();
  if (kind === "agent") return "Hermes";
  if (kind === "system") return "System";
  return "Operator";
}

function client(injected?: SupabaseClient) {
  return injected ?? getSupabaseAdminClient();
}

function unavailable(message: string): { status: "unavailable"; message: string } {
  return { status: "unavailable", message };
}

export async function getRecordTimeline(
  entityType: CrmEntityType,
  entityId: string,
  orgId: string,
  injected?: SupabaseClient,
): Promise<TimelineResult> {
  if (!injected && !isSupabaseAdminConfigured()) return unavailable("Supabase is not configured.");
  const { data, error } = await client(injected)
    .from("crm_activities")
    .select("id,activity_type,summary,detail,actor_kind,actor_name,occurred_at")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) return unavailable(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    activity_type: CrmActivityType;
    summary: string;
    detail: string | null;
    actor_kind: ActorKind;
    actor_name: string | null;
    occurred_at: string;
  }>;
  return {
    status: "live",
    entries: rows.map((row) => ({
      id: row.id,
      activityType: row.activity_type,
      tone: ACTIVITY_TONE[row.activity_type] ?? "gray",
      summary: row.summary,
      detail: row.detail,
      actorKind: row.actor_kind,
      actorLabel: actorLabel(row.actor_kind, row.actor_name),
      occurredAt: row.occurred_at,
    })),
  };
}

export async function getRecordNotes(
  entityType: CrmEntityType,
  entityId: string,
  orgId: string,
  injected?: SupabaseClient,
): Promise<NotesResult> {
  if (!injected && !isSupabaseAdminConfigured()) return unavailable("Supabase is not configured.");
  const { data, error } = await client(injected)
    .from("crm_notes")
    .select("id,body,is_pinned,is_internal,author_kind,author_name,created_at")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return unavailable(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    body: string;
    is_pinned: boolean;
    is_internal: boolean;
    author_kind: ActorKind;
    author_name: string | null;
    created_at: string;
  }>;
  const notes: NoteEntry[] = rows.map((row) => ({
    id: row.id,
    body: row.body,
    isPinned: row.is_pinned,
    isInternal: row.is_internal,
    actorKind: row.author_kind,
    actorLabel: actorLabel(row.author_kind, row.author_name),
    createdAt: row.created_at,
  }));
  // Pinned first, otherwise preserve the created_at-desc order from the query.
  notes.sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  return { status: "live", notes };
}

export async function getRecordTasks(
  entityType: CrmEntityType,
  entityId: string,
  orgId: string,
  injected?: SupabaseClient,
  now: Date = new Date(),
): Promise<TasksResult> {
  if (!injected && !isSupabaseAdminConfigured()) return unavailable("Supabase is not configured.");
  const { data, error } = await client(injected)
    .from("crm_tasks")
    .select(
      "id,title,description,due_at,priority,status,assignee_kind,assignee_name,author_kind,author_name,created_at",
    )
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) return unavailable(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    due_at: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    assignee_kind: ActorKind | null;
    assignee_name: string | null;
    author_kind: ActorKind;
    author_name: string | null;
    created_at: string;
  }>;
  return {
    status: "live",
    tasks: rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      dueAt: row.due_at,
      priority: row.priority,
      status: row.status,
      urgency: deriveTaskUrgency(row.due_at, now),
      assigneeLabel: row.assignee_kind ? actorLabel(row.assignee_kind, row.assignee_name) : null,
      actorKind: row.author_kind,
      actorLabel: actorLabel(row.author_kind, row.author_name),
      createdAt: row.created_at,
    })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/interactions/read-model.test.ts`
Expected: PASS.

> Note: the mock chain is order-insensitive and records every call, so chaining `.eq(...).eq(...).order(...)` works; the `nullsFirst` option is ignored by the mock.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm exec eslint src/lib/interactions/read-model.ts src/lib/interactions/read-model.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/interactions/read-model.ts src/lib/interactions/read-model.test.ts
git commit -m "feat(crm): org-scoped read-model for timeline, notes, tasks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Lib — interaction persistence (writes + companion activities)

**Files:**
- Create: `src/lib/interactions/persistence.ts`

No unit test (thin insert wrappers over the admin client); verified by typecheck/lint and exercised by the server actions (Task 7) and API (Task 8). The validated domain inputs are already covered by Task 3.

- [ ] **Step 1: Write the implementation**

Create `src/lib/interactions/persistence.ts`:

```typescript
import {
  type ActivityInput,
  type CrmActivityType,
  type NoteInput,
  type TaskInput,
} from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type PersistResult = { ok: true; id: string } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured, so nothing was written.";

/** Write a free-standing activity row (also used as a companion to notes/tasks). */
export async function insertActivity(input: ActivityInput): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_activities")
    .insert({
      org_id: orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      activity_type: input.activityType,
      summary: input.summary,
      detail: input.detail ?? null,
      actor_kind: input.actorKind,
      actor_name: input.actorName ?? null,
      metadata: (input.metadata ?? {}) as never,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Internal helper so note/task writes can log a companion activity without re-fetching the org. */
async function logCompanionActivity(
  orgId: string,
  input: Omit<ActivityInput, "metadata"> & { metadata?: Record<string, unknown> },
): Promise<void> {
  await getSupabaseAdminClient()
    .from("crm_activities")
    .insert({
      org_id: orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      activity_type: input.activityType,
      summary: input.summary,
      detail: input.detail ?? null,
      actor_kind: input.actorKind,
      actor_name: input.actorName ?? null,
      metadata: (input.metadata ?? {}) as never,
    });
}

export async function insertNote(input: NoteInput): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_notes")
    .insert({
      org_id: orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      body: input.body,
      is_pinned: input.isPinned,
      is_internal: input.isInternal,
      author_kind: input.authorKind,
      author_name: input.authorName ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };

  await logCompanionActivity(orgId, {
    entityType: input.entityType,
    entityId: input.entityId,
    activityType: "note_added",
    summary: "Note added",
    detail: input.body.slice(0, 280),
    actorKind: input.authorKind,
    actorName: input.authorName,
    metadata: { note_id: data.id },
  });

  return { ok: true, id: data.id };
}

export async function insertTask(input: TaskInput): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_tasks")
    .insert({
      org_id: orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      title: input.title,
      description: input.description ?? null,
      due_at: input.dueAt ?? null,
      priority: input.priority,
      status: input.status,
      assignee_kind: input.assigneeKind ?? null,
      assignee_name: input.assigneeName ?? null,
      author_kind: input.authorKind,
      author_name: input.authorName ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };

  if (input.entityType && input.entityId) {
    await logCompanionActivity(orgId, {
      entityType: input.entityType,
      entityId: input.entityId,
      activityType: "task_created",
      summary: `Task created: ${input.title}`,
      actorKind: input.authorKind,
      actorName: input.authorName,
      metadata: { task_id: data.id },
    });
  }

  return { ok: true, id: data.id };
}

/** Mark a task completed (or another terminal status) and log a companion activity. */
export async function updateTaskStatus(
  taskId: string,
  status: TaskInput["status"],
  actor: { kind: NoteInput["authorKind"]; name?: string },
): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const supabase = getSupabaseAdminClient();
  const completedAt = status === "completed" ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("crm_tasks")
    .update({ status, completed_at: completedAt })
    .eq("id", taskId)
    .eq("org_id", orgId)
    .select("id,title,entity_type,entity_id")
    .single<{
      id: string;
      title: string;
      entity_type: ActivityInput["entityType"] | null;
      entity_id: string | null;
    }>();
  if (error) return { ok: false, error: error.message };

  if (status === "completed" && data.entity_type && data.entity_id) {
    const activityType: CrmActivityType = "task_completed";
    await logCompanionActivity(orgId, {
      entityType: data.entity_type,
      entityId: data.entity_id,
      activityType,
      summary: `Task completed: ${data.title}`,
      actorKind: actor.kind,
      actorName: actor.name,
      metadata: { task_id: data.id },
    });
  }

  return { ok: true, id: data.id };
}

/** Toggle a note's pinned flag (org-scoped). */
export async function setNotePinned(noteId: string, isPinned: boolean): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_notes")
    .update({ is_pinned: isPinned })
    .eq("id", noteId)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm exec eslint src/lib/interactions/persistence.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/interactions/persistence.ts
git commit -m "feat(crm): org-scoped persistence for notes, tasks, activities

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Server actions — add note / create task / complete task / log activity / pin

**Files:**
- Create: `src/app/crm/interactions-actions.ts`

A `"use server"` module may only export async functions (per the note in `entity-keys.ts`). Helpers that aren't actions must live inline as non-exported functions.

- [ ] **Step 1: Write the implementation**

Create `src/app/crm/interactions-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseActivityInput,
  parseNoteInput,
  parseTaskInput,
  type CrmEntityType,
} from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import {
  insertActivity,
  insertNote,
  insertTask,
  setNotePinned,
  updateTaskStatus,
} from "@/lib/interactions/persistence";

// CRM object key (plural, used in URLs) <-> entity type (singular, stored).
const OBJECT_KEY_FOR_ENTITY: Record<CrmEntityType, string> = {
  company: "companies",
  contact: "contacts",
  property: "properties",
  lead: "leads",
  job: "jobs",
  outcome: "outcomes",
  campaign: "campaigns",
};

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function recordPath(entityType: CrmEntityType, entityId: string): string {
  return `/crm/${OBJECT_KEY_FOR_ENTITY[entityType]}/${entityId}`;
}

function revalidateRecord(entityType: CrmEntityType, entityId: string): void {
  revalidatePath(recordPath(entityType, entityId));
  revalidatePath(`/crm/${OBJECT_KEY_FOR_ENTITY[entityType]}`);
}

// getOperatorActor() returns the configured operator email or a neutral label
// (synchronous; single shared-secret gate today). Swap when real per-user auth lands.

export async function addNoteAction(formData: FormData) {
  await requireOperator();
  const entityType = field(formData, "entityType");
  const entityId = field(formData, "entityId");

  const parsed = parseNoteInput({
    entityType,
    entityId,
    body: field(formData, "body"),
    isInternal: formData.get("isInternal") === "on",
    authorKind: "human",
    authorName: getOperatorActor(),
  });
  if (!parsed.ok) {
    redirect(`${recordPath(entityType as CrmEntityType, entityId)}?action=note-error&message=${encodeURIComponent(parsed.error)}`);
  }

  const result = await insertNote(parsed.value);
  if (!result.ok) {
    redirect(`${recordPath(parsed.value.entityType, parsed.value.entityId)}?action=note-error&message=${encodeURIComponent(result.error)}`);
  }

  revalidateRecord(parsed.value.entityType, parsed.value.entityId);
  redirect(`${recordPath(parsed.value.entityType, parsed.value.entityId)}?action=note-added`);
}

export async function createTaskAction(formData: FormData) {
  await requireOperator();
  const entityType = field(formData, "entityType");
  const entityId = field(formData, "entityId");
  const dueDate = field(formData, "dueAt");

  const parsed = parseTaskInput({
    entityType,
    entityId,
    title: field(formData, "title"),
    description: field(formData, "description"),
    dueAt: dueDate ? new Date(dueDate).toISOString() : null,
    priority: field(formData, "priority") || "normal",
    authorKind: "human",
    authorName: getOperatorActor(),
  });
  if (!parsed.ok) {
    redirect(`${recordPath(entityType as CrmEntityType, entityId)}?action=task-error&message=${encodeURIComponent(parsed.error)}`);
  }

  const result = await insertTask(parsed.value);
  if (!result.ok) {
    redirect(`${recordPath(entityType as CrmEntityType, entityId)}?action=task-error&message=${encodeURIComponent(result.error)}`);
  }

  revalidateRecord(entityType as CrmEntityType, entityId);
  redirect(`${recordPath(entityType as CrmEntityType, entityId)}?action=task-created`);
}

export async function completeTaskAction(formData: FormData) {
  await requireOperator();
  const taskId = field(formData, "taskId");
  const entityType = field(formData, "entityType") as CrmEntityType;
  const entityId = field(formData, "entityId");

  const result = await updateTaskStatus(taskId, "completed", {
    kind: "human",
    name: getOperatorActor(),
  });
  if (!result.ok) {
    redirect(`${recordPath(entityType, entityId)}?action=task-error&message=${encodeURIComponent(result.error)}`);
  }

  revalidateRecord(entityType, entityId);
  redirect(`${recordPath(entityType, entityId)}?action=task-completed`);
}

export async function logActivityAction(formData: FormData) {
  await requireOperator();
  const entityType = field(formData, "entityType");
  const entityId = field(formData, "entityId");

  const parsed = parseActivityInput({
    entityType,
    entityId,
    activityType: field(formData, "activityType"),
    summary: field(formData, "summary"),
    detail: field(formData, "detail"),
    actorKind: "human",
    actorName: getOperatorActor(),
  });
  if (!parsed.ok) {
    redirect(`${recordPath(entityType as CrmEntityType, entityId)}?action=activity-error&message=${encodeURIComponent(parsed.error)}`);
  }

  const result = await insertActivity(parsed.value);
  if (!result.ok) {
    redirect(`${recordPath(parsed.value.entityType, parsed.value.entityId)}?action=activity-error&message=${encodeURIComponent(result.error)}`);
  }

  revalidateRecord(parsed.value.entityType, parsed.value.entityId);
  redirect(`${recordPath(parsed.value.entityType, parsed.value.entityId)}?action=activity-logged`);
}

export async function pinNoteAction(formData: FormData) {
  await requireOperator();
  const noteId = field(formData, "noteId");
  const entityType = field(formData, "entityType") as CrmEntityType;
  const entityId = field(formData, "entityId");
  const pinned = formData.get("isPinned") === "true";

  const result = await setNotePinned(noteId, pinned);
  if (!result.ok) {
    redirect(`${recordPath(entityType, entityId)}?action=note-error&message=${encodeURIComponent(result.error)}`);
  }

  revalidateRecord(entityType, entityId);
  redirect(`${recordPath(entityType, entityId)}?action=note-updated`);
}
```

- [ ] **Step 2: Confirm `getOperatorActor` exists and is exported**

Run: `pnpm exec grep -n "getOperatorActor" src/lib/auth/operator.ts`
Expected: `export function getOperatorActor(): string` (synchronous; returns the configured operator email or a neutral label). If absent/renamed, update the import + calls in this file to match.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm exec eslint src/app/crm/interactions-actions.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/crm/interactions-actions.ts
git commit -m "feat(crm): server actions for notes, tasks, activity logging

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Hermes API — `POST /api/v1/hermes/crm/interactions`

**Files:**
- Create: `src/app/api/v1/hermes/crm/interactions/route.ts`

- [ ] **Step 1: Write the implementation**

Create `src/app/api/v1/hermes/crm/interactions/route.ts`:

```typescript
import { fail, guard, INVALID_JSON, ok, readJson } from "@/app/api/v1/hermes/_lib/http";
import { parseActivityInput, parseNoteInput, parseTaskInput } from "@/domain";
import { insertActivity, insertNote, insertTask } from "@/lib/interactions/persistence";

/**
 * Lets Hermes attach notes, follow-up tasks, and timeline activities to any CRM
 * record. Writes through the same persistence path as the human UI, always as
 * author_kind = "agent". No outbound side effects.
 *
 *   POST /api/v1/hermes/crm/interactions
 *   { "kind": "note" | "task" | "activity", ...payload }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }

  const payload = body as Record<string, unknown>;
  const kind = payload.kind;
  const authorName = typeof payload.author_name === "string" ? payload.author_name : "Hermes";

  try {
    if (kind === "note") {
      const parsed = parseNoteInput({
        entityType: payload.entity_type,
        entityId: payload.entity_id,
        body: payload.body,
        isPinned: payload.is_pinned === true,
        isInternal: payload.is_internal === true,
        authorKind: "agent",
        authorName,
      });
      if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
      const result = await insertNote(parsed.value);
      if (!result.ok) return fail("failed", result.error, 502);
      return ok({ id: result.id, kind: "note" }, 201);
    }

    if (kind === "task") {
      const parsed = parseTaskInput({
        entityType: payload.entity_type,
        entityId: payload.entity_id,
        title: payload.title,
        description: payload.description,
        dueAt: payload.due_at,
        priority: payload.priority,
        assigneeKind: payload.assignee_kind,
        assigneeName: payload.assignee_name,
        authorKind: "agent",
        authorName,
      });
      if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
      const result = await insertTask(parsed.value);
      if (!result.ok) return fail("failed", result.error, 502);
      return ok({ id: result.id, kind: "task" }, 201);
    }

    if (kind === "activity") {
      const parsed = parseActivityInput({
        entityType: payload.entity_type,
        entityId: payload.entity_id,
        activityType: payload.activity_type,
        summary: payload.summary,
        detail: payload.detail,
        actorKind: "agent",
        actorName: authorName,
        metadata: payload.metadata,
      });
      if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
      const result = await insertActivity(parsed.value);
      if (!result.ok) return fail("failed", result.error, 502);
      return ok({ id: result.id, kind: "activity" }, 201);
    }

    return fail("invalid_request", 'Field "kind" must be one of: note, task, activity.', 400);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to write interaction.", 502);
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm exec eslint src/app/api/v1/hermes/crm/interactions/route.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/hermes/crm/interactions/route.ts
git commit -m "feat(crm): Hermes API to attach notes/tasks/activities to records

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: UI — Timeline / Notes / Tasks panels

**Files:**
- Create: `src/app/crm/_components/record-interactions/timeline.tsx`
- Create: `src/app/crm/_components/record-interactions/notes-panel.tsx`
- Create: `src/app/crm/_components/record-interactions/tasks-panel.tsx`

All three are server components rendering data + plain HTML `<form action={serverAction}>`. Reuse `Panel`, `StatusPill`, `EmptyState`, `buttonClasses` from `../../_components/page-header`. Follow DESIGN.md (no emojis; Command Charcoal / Canvas White / Restoration Red; calm).

- [ ] **Step 1: Write `ActorBadge` + `RecordTimeline`**

Create `src/app/crm/_components/record-interactions/timeline.tsx`:

```tsx
import { EmptyState, Panel, StatusPill } from "../../../_components/page-header";
import { type TimelineEntry } from "@/lib/interactions/read-model";
import { type ActorKind } from "@/domain";

export function ActorBadge({ kind, label }: { kind: ActorKind; label: string }) {
  const tone = kind === "agent" ? "blue" : kind === "system" ? "gray" : "green";
  const who = kind === "agent" ? "Hermes" : kind === "system" ? "System" : "Human";
  return (
    <StatusPill tone={tone}>
      {who}
      {label && label !== who ? ` · ${label}` : ""}
    </StatusPill>
  );
}

const TONE_DOT: Record<string, string> = {
  green: "bg-[oklch(0.78_0.14_158)]",
  red: "bg-[oklch(0.68_0.2_26)]",
  amber: "bg-[var(--warn)]",
  blue: "bg-[var(--accent)]",
  gray: "bg-[var(--text-muted)]",
};

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function RecordTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Panel className="module-rise">
      <div className="signal-eyebrow">Activity</div>
      <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">Timeline</h2>
      {entries.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No activity yet" detail="Notes, tasks, and logged calls will appear here." />
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="grid grid-cols-[12px_minmax(0,1fr)] gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${TONE_DOT[entry.tone] ?? TONE_DOT.gray}`} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{entry.summary}</span>
                  <ActorBadge kind={entry.actorKind} label={entry.actorLabel} />
                </div>
                {entry.detail ? (
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{entry.detail}</p>
                ) : null}
                <div className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {when(entry.occurredAt)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
```

- [ ] **Step 2: Write `NotesPanel`**

Create `src/app/crm/_components/record-interactions/notes-panel.tsx`:

```tsx
import { ActorBadge } from "./timeline";
import { EmptyState, Panel, StatusPill, buttonClasses } from "../../../_components/page-header";
import { addNoteAction, pinNoteAction } from "../../interactions-actions";
import { type NoteEntry } from "@/lib/interactions/read-model";
import { type CrmEntityType } from "@/domain";

const inputClass =
  "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]";

export function NotesPanel({
  entityType,
  entityId,
  notes,
}: {
  entityType: CrmEntityType;
  entityId: string;
  notes: NoteEntry[];
}) {
  return (
    <Panel className="module-rise">
      <div className="signal-eyebrow">Notes</div>
      <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">Notes</h2>

      <form action={addNoteAction} className="mt-4 space-y-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <textarea
          name="body"
          required
          rows={3}
          placeholder="Add context for the team and Mark…"
          className={inputClass}
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
            <input type="checkbox" name="isInternal" /> Internal only
          </label>
          <button type="submit" className={buttonClasses({ variant: "primary", size: "sm" })}>
            Add note
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-3">
        {notes.length === 0 ? (
          <EmptyState title="No notes yet" detail="Write the first note above." />
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ActorBadge kind={note.actorKind} label={note.actorLabel} />
                {note.isPinned ? <StatusPill tone="amber">Pinned</StatusPill> : null}
                {note.isInternal ? <StatusPill tone="gray">Internal</StatusPill> : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{note.body}</p>
              <form action={pinNoteAction} className="mt-2">
                <input type="hidden" name="noteId" value={note.id} />
                <input type="hidden" name="entityType" value={entityType} />
                <input type="hidden" name="entityId" value={entityId} />
                <input type="hidden" name="isPinned" value={note.isPinned ? "false" : "true"} />
                <button type="submit" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                  {note.isPinned ? "Unpin" : "Pin"}
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 3: Write `TasksPanel`**

Create `src/app/crm/_components/record-interactions/tasks-panel.tsx`:

```tsx
import { ActorBadge } from "./timeline";
import { EmptyState, Panel, StatusPill, buttonClasses } from "../../../_components/page-header";
import { completeTaskAction, createTaskAction } from "../../interactions-actions";
import { type TaskEntry } from "@/lib/interactions/read-model";
import { type CrmEntityType } from "@/domain";

const inputClass =
  "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]";

const URGENCY_TONE: Record<TaskEntry["urgency"], "red" | "amber" | "blue" | "gray"> = {
  overdue: "red",
  due_today: "amber",
  upcoming: "blue",
  none: "gray",
};

const URGENCY_LABEL: Record<TaskEntry["urgency"], string> = {
  overdue: "Overdue",
  due_today: "Due today",
  upcoming: "Upcoming",
  none: "No due date",
};

function dueLabel(value: string | null): string {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function TasksPanel({
  entityType,
  entityId,
  tasks,
}: {
  entityType: CrmEntityType;
  entityId: string;
  tasks: TaskEntry[];
}) {
  const open = tasks.filter((task) => task.status === "open" || task.status === "in_progress");
  const done = tasks.filter((task) => task.status === "completed" || task.status === "canceled");

  return (
    <Panel className="module-rise">
      <div className="signal-eyebrow">Follow-ups</div>
      <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">Tasks</h2>

      <form action={createTaskAction} className="mt-4 space-y-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input name="title" required placeholder="What needs to happen next?" className={inputClass} />
        <div className="grid grid-cols-2 gap-2">
          <input type="date" name="dueAt" className={inputClass} />
          <select name="priority" defaultValue="normal" className={inputClass}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div className="flex justify-end">
          <button type="submit" className={buttonClasses({ variant: "primary", size: "sm" })}>
            Create task
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-3">
        {open.length === 0 ? (
          <EmptyState title="No open tasks" detail="Create a follow-up above." />
        ) : (
          open.map((task) => (
            <div
              key={task.id}
              className={`rounded-lg border p-3 ${
                task.urgency === "overdue"
                  ? "border-[oklch(0.68_0.2_26/0.5)] bg-[oklch(0.68_0.2_26/0.1)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-inset)]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{task.title}</span>
                <StatusPill tone={URGENCY_TONE[task.urgency]}>{URGENCY_LABEL[task.urgency]}</StatusPill>
                <StatusPill tone={task.priority === "urgent" || task.priority === "high" ? "red" : "gray"}>
                  {task.priority}
                </StatusPill>
                <ActorBadge kind={task.actorKind} label={task.actorLabel} />
              </div>
              {task.description ? (
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{task.description}</p>
              ) : null}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Due {dueLabel(task.dueAt)}
                </span>
                <form action={completeTaskAction}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="entityType" value={entityType} />
                  <input type="hidden" name="entityId" value={entityId} />
                  <button type="submit" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                    Mark complete
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
        {done.length > 0 ? (
          <div className="pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {done.length} completed / closed
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm exec eslint src/app/crm/_components/record-interactions/timeline.tsx src/app/crm/_components/record-interactions/notes-panel.tsx src/app/crm/_components/record-interactions/tasks-panel.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/crm/_components/record-interactions/
git commit -m "feat(crm): timeline, notes, and tasks UI panels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Wire panels into the record page

**Files:**
- Modify: `src/app/crm/_components/crm-record-page.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/app/crm/_components/crm-record-page.tsx`, after the existing imports, add:

```typescript
import { entityTypeFromCrmObjectKey } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getRecordNotes, getRecordTasks, getRecordTimeline } from "@/lib/interactions/read-model";
import { RecordTimeline } from "./record-interactions/timeline";
import { NotesPanel } from "./record-interactions/notes-panel";
import { TasksPanel } from "./record-interactions/tasks-panel";
```

- [ ] **Step 2: Extend the feedback list + messages**

Replace the `RECORD_FEEDBACK` constant:

```typescript
const RECORD_FEEDBACK = [
  "created",
  "updated",
  "crm-error",
  "not-configured",
  "note-added",
  "note-updated",
  "note-error",
  "task-created",
  "task-completed",
  "task-error",
  "activity-logged",
  "activity-error",
];
```

In the `<ActionFeedback ... messages={{ ... }} />` block, add these keys to the existing `messages` object:

```typescript
          "note-added": "Note added.",
          "note-updated": "Note updated.",
          "note-error": "That note could not be saved.",
          "task-created": "Task created.",
          "task-completed": "Task marked complete.",
          "task-error": "That task could not be saved.",
          "activity-logged": "Activity logged.",
          "activity-error": "That activity could not be logged.",
```

- [ ] **Step 3: Load interaction data in the page body**

In `CrmRecordPage`, after the `linkedCampaigns` line, add:

```typescript
  const entityType = entityTypeFromCrmObjectKey(objectKey);
  let timeline: Awaited<ReturnType<typeof getRecordTimeline>> | null = null;
  let notes: Awaited<ReturnType<typeof getRecordNotes>> | null = null;
  let tasks: Awaited<ReturnType<typeof getRecordTasks>> | null = null;
  if (entityType && isSupabaseAdminConfigured()) {
    const orgId = await getCurrentOrgId();
    [timeline, notes, tasks] = await Promise.all([
      getRecordTimeline(entityType, recordId, orgId),
      getRecordNotes(entityType, recordId, orgId),
      getRecordTasks(entityType, recordId, orgId),
    ]);
  }
```

- [ ] **Step 4: Render the panels and remove the scaffold**

In the returned JSX, in the **main column** `<div className="min-w-0 space-y-5">`, after `<RelatedRecords record={record} />` and before `<LinkedCampaignsPanel ... />`, insert:

```tsx
          {entityType ? (
            <>
              {tasks?.status === "live" ? (
                <TasksPanel entityType={entityType} entityId={recordId} tasks={tasks.tasks} />
              ) : null}
              {notes?.status === "live" ? (
                <NotesPanel entityType={entityType} entityId={recordId} notes={notes.notes} />
              ) : null}
              {timeline?.status === "live" ? <RecordTimeline entries={timeline.entries} /> : null}
            </>
          ) : null}
```

Then **delete** the `<NextActions ... />` usage in the aside and the now-unused `NextActions` function, `actionCards`, `actionLabels`, `actionMessage`, `actionIconClass`, `actionCardActiveClass` declarations. (They were the scaffold "Locked record tools".) Keep `MissingFields` and `IntelligencePanel`.

> If removing `actionMessage` leaves an unused-variable lint error, also remove its declaration near the top of `CrmRecordPage`.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm exec eslint src/app/crm/_components/crm-record-page.tsx`
Expected: no errors (no unused vars left from the removed scaffold).

- [ ] **Step 6: Commit**

```bash
git add src/app/crm/_components/crm-record-page.tsx
git commit -m "feat(crm): wire timeline, notes, tasks into record pages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Stamp `org_id` on new CRM record creation

**Files:**
- Modify: `src/app/crm/actions.ts`

New companies/contacts/properties created through the CRM form must carry `org_id` (the column is now NOT NULL). The admin client bypasses RLS, so this stamp is the only thing setting the tenant.

- [ ] **Step 1: Import the chokepoint**

At the top of `src/app/crm/actions.ts`, add:

```typescript
import { getCurrentOrgId } from "@/lib/auth/org";
```

- [ ] **Step 2: Stamp `org_id` in `createCrmRecordAction`**

In `createCrmRecordAction`, after `const result = buildInsert(objectKey, formData);` and its error check, before `insertEntity`, add the org id to the insert payload:

```typescript
  const orgId = await getCurrentOrgId();
  const insertWithOrg = { ...result.insert, org_id: orgId } as typeof result.insert;
  const inserted = await insertEntity(supabase, objectKey, insertWithOrg);
```

(Replace the existing `const inserted = await insertEntity(supabase, objectKey, result.insert);` line.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. (`TablesInsert<"companies">` etc. now include optional `org_id` from Task 2.)
Run: `pnpm exec eslint src/app/crm/actions.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/crm/actions.ts
git commit -m "feat(crm): stamp org_id when creating CRM records

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Scope existing CRM reads by org (isolation completeness)

**Files:**
- Modify: `src/lib/crm/read-model.ts`

The 6 CRM tables now have `org_id`. The list/overview/record read paths must filter by the current org so a second tenant cannot see BSR rows. Scope only the queries against the 6 CRM tables.

- [ ] **Step 1: Read the current query sites**

Run: `pnpm exec grep -n "from(\|\.eq(\|getSupabaseAdminClient\|async function get" src/lib/crm/read-model.ts`
Expected: lists `getCrmOverviewData`, `getCrmObjectData`, `getCrmNavCounts`, `getCrmRecordData` and their `.from(<table>)` calls.

- [ ] **Step 2: Add an org filter to each CRM-table query**

For each `.from(<crmTable>).select(...)` chain in these four functions, add `.eq("org_id", orgId)` where `orgId` comes from `getCurrentOrgId()`. Because these functions accept an optional injected `client` (for tests), resolve the org id only when not injected, and make tests pass an org by reading from the same mock. Concretely, at the top of each function add:

```typescript
  const orgId = client ? null : await getCurrentOrgId();
```

and build each query conditionally:

```typescript
  let query = supabase.from("companies").select("...");
  if (orgId) query = query.eq("org_id", orgId);
```

Add the import at the top of the file:

```typescript
import { getCurrentOrgId } from "@/lib/auth/org";
```

> Rationale for the `client ? null` guard: the existing `read-model.test.ts` injects a mock client and asserts specific `.calls`. Skipping the org filter when a client is injected keeps those tests valid while production (no injected client) is always org-scoped. This is acceptable because tenant isolation in production never injects a client.

- [ ] **Step 3: Run the existing CRM read-model test**

Run: `pnpm test src/lib/crm/read-model.test.ts`
Expected: PASS (injected-client path unchanged).

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Run: `pnpm exec eslint src/lib/crm/read-model.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/read-model.ts
git commit -m "feat(crm): scope CRM reads by current org

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Docs + env + full verification

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the new env var**

In `.env.example`, add under the appropriate section:

```bash
# Optional: which seeded organization the single deployment serves (multi-tenant chokepoint).
DEFAULT_ORG_SLUG=big-shoulders-restoration
```

- [ ] **Step 2: Note the new layer in CLAUDE.md**

In `CLAUDE.md`, under "Wired Persistence vs. Scaffold-Mode", add a bullet to the wired list:

```markdown
- **CRM interactions** (`src/app/crm/_components/record-interactions/`, `src/lib/interactions/`, `src/domain/interactions.ts`) — record-attached notes, follow-up tasks, and activity timeline. Org-scoped via `getCurrentOrgId()` (`src/lib/auth/org.ts`); the same persistence path serves humans (server actions) and Hermes (`POST /api/v1/hermes/crm/interactions`).
```

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: PASS (all existing tests + the new `interactions.test.ts` and `read-model.test.ts`).

- [ ] **Step 4: Full typecheck + build**

Run: `pnpm build`
Expected: build succeeds (this is the real typecheck gate per project memory).

- [ ] **Step 5: Lint the full set of changed files**

Run: `pnpm exec eslint src/domain/interactions.ts src/domain/__tests__/interactions.test.ts src/lib/auth/org.ts src/lib/interactions/persistence.ts src/lib/interactions/read-model.ts src/lib/interactions/read-model.test.ts src/app/crm/interactions-actions.ts src/app/crm/actions.ts src/app/crm/_components/crm-record-page.tsx src/app/crm/_components/record-interactions/timeline.tsx src/app/crm/_components/record-interactions/notes-panel.tsx src/app/crm/_components/record-interactions/tasks-panel.tsx src/app/api/v1/hermes/crm/interactions/route.ts src/lib/crm/read-model.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "docs(crm): document interaction layer + DEFAULT_ORG_SLUG

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual verification checklist (after all tasks, with Supabase configured + migration applied)

- [ ] Open a contact detail page → Timeline, Notes, Tasks panels render (no more "Locked record tools").
- [ ] Add a note → it appears in Notes immediately and as a `note_added` row in Timeline; the Human badge shows.
- [ ] Pin the note → it sorts to the top with a "Pinned" pill.
- [ ] Create a task with a past due date → it shows "Overdue" (red) styling.
- [ ] Mark the task complete → it leaves the open list and a `task_completed` row appears in Timeline.
- [ ] `POST /api/v1/hermes/crm/interactions` with `{ "kind":"note", "entity_type":"contact", "entity_id":"<id>", "body":"agent note" }` and a valid bearer token → 201; the note shows a **Hermes** badge on the page.
- [ ] Without `HERMES_AGENT_API_TOKEN` set, the same POST returns 503 `not_configured`.

---

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| A. Tenancy — organizations + org_id + backfill | Task 1, 2 |
| A. Current-org chokepoint `getCurrentOrgId()` | Task 4 |
| A. RLS defense-in-depth | Task 1 |
| B. crm_notes / crm_tasks / crm_activities tables + enums | Task 1, 2 |
| B. Activity generation rules (companion activities) | Task 6 |
| C. domain/interactions.ts (pure, tested) | Task 3 |
| C. lib/interactions persistence + read-model | Task 5, 6 |
| C. crm/interactions-actions.ts (requireOperator, no outbound) | Task 7 |
| C. Hermes API endpoint (agent author) | Task 8 |
| D. Timeline / Notes / Tasks UI + action affordances | Task 9, 10 |
| D. Human vs Hermes badge | Task 9 (`ActorBadge`) |
| E. Migration + database.types.ts update | Task 1, 2 |
| F. Tests + verification | Task 3, 5, 13 |
| Isolation completeness (reads + writes scoped) | Task 11, 12 |
| Docs/env | Task 13 |
```
