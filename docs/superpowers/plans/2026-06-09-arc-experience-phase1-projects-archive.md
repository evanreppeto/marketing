# Arc Experience — Phase 1 (Projects + Archive + Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Make the Arc chat sidebar feel professional — group conversations into projects, archive/unarchive chats, and fix the sparse thread layout — with no dependency on Arc's runtime.

**Architecture:** Add a `arc_projects` table + nullable `arc_conversations.project_id`; extend `src/lib/arc-chat/persistence.ts` with project + archive helpers; add server actions in `src/app/arc/actions.ts`; group the sidebar and add an archived view in `src/app/arc/_components/`. Live step-by-step activity is a SEPARATE Phase 2 plan.

**Tech Stack:** Next.js 16 + TypeScript + Supabase + vitest. Migration applied via the Supabase MCP `apply_migration` (this branch has no local migrations dir).

> **⚠️ BUILD-COORDINATION CAUTION:** `src/app/arc/**` and `src/lib/arc-chat/persistence.ts` are under **active parallel development**. The UI code below is written against the files as of 2026-06-09 — **re-read each file immediately before editing and reconcile** (the data/persistence/action layers are stable and low-conflict; the component edits are the churny part). Make small, focused commits.

---

## File map
- DB: `arc_projects` table + `arc_conversations.project_id` (MCP `apply_migration`, name `arc_projects`).
- Modify `src/lib/arc-chat/persistence.ts` — project type/CRUD, archive list/unarchive, `project_id` on conversation.
- Create `src/lib/arc-chat/persistence.projects.test.ts` — persistence tests (mock client).
- Modify `src/app/arc/actions.ts` — project + move + unarchive server actions.
- Modify `src/app/arc/page.tsx` — load projects (+ archived when `?archived=1`) and pass down.
- Modify `src/app/arc/_components/thread-sidebar.tsx` — grouped projects, archive section, controls.
- Modify `src/app/arc/_components/arc-chat.tsx` — thread props for projects/archived.
- Modify `src/app/arc/_components/message-list.tsx` — layout polish (column constraint).

---

## Task 1: Database — projects table + conversation link

- [ ] **Step 1: Apply migration** via Supabase MCP `apply_migration` (project `fpjvgqrfqncnudqeudee`, name `arc_projects`):

```sql
create table public.arc_projects (
  id uuid primary key default gen_random_uuid(),
  operator text not null,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.arc_projects enable row level security;
create trigger arc_projects_set_updated_at
  before update on public.arc_projects
  for each row execute function public.set_updated_at();

alter table public.arc_conversations
  add column if not exists project_id uuid references public.arc_projects(id) on delete set null;
create index if not exists arc_conversations_project_idx on public.arc_conversations(project_id);
```

- [ ] **Step 2: Verify** with `execute_sql`: `select column_name from information_schema.columns where table_name='arc_conversations' and column_name='project_id';` returns one row, and `arc_projects` exists.

## Task 2: Persistence — surface `project_id` on conversations

**File:** `src/lib/arc-chat/persistence.ts`

- [ ] **Step 1:** Add `projectId` to the `MarkConversation` type and `project_id` to `ConversationRow`:

```typescript
export type MarkConversation = {
  id: string;
  operator: string;
  title: string;
  status: "active" | "archived";
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};
```
```typescript
type ConversationRow = {
  id: string;
  operator: string;
  title: string;
  status: "active" | "archived";
  project_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};
```

- [ ] **Step 2:** Add `project_id` to `CONVERSATION_COLUMNS` and map it in `toConversation`:

```typescript
const CONVERSATION_COLUMNS = "id, operator, title, status, project_id, created_at, updated_at, last_message_at";
```
```typescript
function toConversation(row: ConversationRow): MarkConversation {
  return {
    id: row.id,
    operator: row.operator,
    title: row.title,
    status: row.status,
    projectId: row.project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}
```

- [ ] **Step 3: Verify** `pnpm vitest run src/lib/arc-chat` (existing tests, if any) + `pnpm lint` stay green.

## Task 3: Persistence — projects CRUD + archive helpers (TDD)

**Files:** `src/lib/arc-chat/persistence.ts`; Test `src/lib/arc-chat/persistence.projects.test.ts`

- [ ] **Step 1: Write the failing test** (`persistence.projects.test.ts`)

```typescript
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { createProject, assignConversationToProject, unarchiveConversation } from "./persistence";

function calls(supabase: MockSupabase, method: string) {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg);
}

describe("arc projects/archive persistence", () => {
  it("createProject inserts a project for the operator and returns it", async () => {
    const supabase = createSupabaseQueryMock({
      arc_projects: { data: { id: "p1", operator: "Evan", name: "Storm Q3", status: undefined }, error: null },
    });
    const project = await createProject({ operator: "Evan", name: "Storm Q3" }, supabase);
    expect(project.id).toBe("p1");
    expect(calls(supabase, "insert")[0]).toMatchObject({ operator: "Evan", name: "Storm Q3" });
  });

  it("assignConversationToProject updates the conversation's project_id", async () => {
    const supabase = createSupabaseQueryMock({ arc_conversations: { data: null, error: null } });
    await assignConversationToProject("c1", "p1", supabase);
    expect(calls(supabase, "update")[0]).toMatchObject({ project_id: "p1" });
  });

  it("unarchiveConversation sets status back to active", async () => {
    const supabase = createSupabaseQueryMock({ arc_conversations: { data: null, error: null } });
    await unarchiveConversation("c1", supabase);
    expect(calls(supabase, "update")[0]).toMatchObject({ status: "active" });
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run src/lib/arc-chat/persistence.projects.test.ts` → cannot find exports.

- [ ] **Step 3: Implement** — add to `src/lib/arc-chat/persistence.ts`:

```typescript
export type MarkProject = { id: string; operator: string; name: string; createdAt: string; updatedAt: string };

type ProjectRow = { id: string; operator: string; name: string; created_at: string; updated_at: string };

const PROJECT_COLUMNS = "id, operator, name, created_at, updated_at";

function toProject(row: ProjectRow): MarkProject {
  return { id: row.id, operator: row.operator, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function createProject(
  input: { operator: string; name: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkProject> {
  const { data, error } = await client
    .from("arc_projects")
    .insert({ operator: input.operator, name: input.name })
    .select(PROJECT_COLUMNS)
    .single<ProjectRow>();
  assertOk("arc_projects insert", error);
  if (!data) throw new Error("arc_projects insert returned no row");
  return toProject(data);
}

export async function listProjects(
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkProject[]> {
  const { data, error } = await client
    .from("arc_projects")
    .select(PROJECT_COLUMNS)
    .eq("operator", operator)
    .order("created_at", { ascending: true });
  assertOk("arc_projects list", error);
  return ((data ?? []) as ProjectRow[]).map(toProject);
}

export async function renameProject(id: string, name: string, client: SupabaseClient = getSupabaseAdminClient()): Promise<void> {
  const { error } = await client.from("arc_projects").update({ name }).eq("id", id);
  assertOk("arc_projects rename", error);
}

export async function assignConversationToProject(
  conversationId: string,
  projectId: string | null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("arc_conversations").update({ project_id: projectId }).eq("id", conversationId);
  assertOk("arc_conversations assign project", error);
}

export async function unarchiveConversation(id: string, client: SupabaseClient = getSupabaseAdminClient()): Promise<void> {
  const { error } = await client.from("arc_conversations").update({ status: "active" }).eq("id", id);
  assertOk("arc_conversations unarchive", error);
}

export async function listArchivedConversations(
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkConversation[]> {
  const { data, error } = await client
    .from("arc_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("operator", operator)
    .eq("status", "archived")
    .order("last_message_at", { ascending: false });
  assertOk("arc_conversations archived list", error);
  return ((data ?? []) as ConversationRow[]).map(toConversation);
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run src/lib/arc-chat/persistence.projects.test.ts` (3 passed). Adjust the mock-call destructuring only if the helper's tuple shape differs.

- [ ] **Step 5: Commit** — `git add src/lib/arc-chat/persistence.ts src/lib/arc-chat/persistence.projects.test.ts && git commit -m "feat(arc-chat): projects + archive persistence helpers"`

## Task 4: Server actions

**File:** `src/app/arc/actions.ts` (re-read first; `archiveThreadAction` already exists — mirror its shape)

- [ ] **Step 1: Add imports** for the new persistence functions (`createProject`, `assignConversationToProject`, `renameProject`, `unarchiveConversation`).

- [ ] **Step 2: Add the actions** (each gated like the existing ones):

```typescript
export async function createProjectAction(_previous: SimpleActionState, formData: FormData): Promise<SimpleActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, message: "Project needs a name." };
  try {
    await createProject({ operator: getOperatorActor(), name });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't create the project." };
  }
  revalidatePath("/arc");
  return { ok: true, message: "Project created." };
}

export async function moveConversationAction(_previous: SimpleActionState, formData: FormData): Promise<SimpleActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const rawProject = String(formData.get("projectId") ?? "").trim();
  if (!conversationId) return { ok: false, message: "Missing conversation." };
  try {
    await assignConversationToProject(conversationId, rawProject || null);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't move the chat." };
  }
  revalidatePath("/arc");
  return { ok: true, message: "Moved." };
}

export async function unarchiveThreadAction(_previous: SimpleActionState, formData: FormData): Promise<SimpleActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };
  const id = String(formData.get("conversationId") ?? "").trim();
  if (!id) return { ok: false, message: "Missing conversation." };
  try {
    await unarchiveConversation(id);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't unarchive." };
  }
  revalidatePath("/arc");
  return { ok: true, message: "Restored." };
}
```

- [ ] **Step 3: Verify** `pnpm lint` clean.
- [ ] **Step 4: Commit** — `git add src/app/arc/actions.ts && git commit -m "feat(arc-chat): project/move/unarchive server actions"`

## Task 5: Load projects + archived in the page

**File:** `src/app/arc/page.tsx` (re-read first)

- [ ] **Step 1:** Import `listProjects` and `listArchivedConversations`. In the success path, after `listConversations`, also load:

```typescript
const projects = await listProjects(operator);
const showArchived = valueOf(params?.archived) === "1";
const archived = showArchived ? await listArchivedConversations(operator) : [];
```
(Add `archived?: string` to the `searchParams` type.) Pass `projects`, `archived`, `showArchived` to `<MarkChat … />`.

- [ ] **Step 2: Verify** the page compiles (`pnpm lint`); guard remains intact (wrap in the existing try/catch so a missing column degrades gracefully).
- [ ] **Step 3: Commit.**

## Task 6: Sidebar — grouped projects + archive section

**File:** `src/app/arc/_components/thread-sidebar.tsx` (re-read first; props now include `projects: MarkProject[]`, `archived: MarkConversation[]`, `showArchived: boolean`)

- [ ] **Step 1:** Group conversations by `projectId`. Render each project as a labeled group (project name → its chats), then an "Chats" group for `projectId === null`. Reuse the existing chat-link markup. Add a **New project** control (a small form posting `createProjectAction`) and, per chat, a **move/archive** affordance (hover menu posting `moveConversationAction` / `archiveThreadAction`). Add an **Archived** toggle linking to `/arc?archived=1`; when `showArchived`, render the `archived` list with an **Unarchive** control (`unarchiveThreadAction`). Keep the existing visual tokens/classes.

> Full component code: write it against the file as it exists at build time (it's under active change). The contract is: input props `{ conversations, projects, archived, showArchived, activeId }`; output the grouped nav described above using the existing link styles.

- [ ] **Step 2: Verify** in the browser (dev server): projects group their chats; archived view lists archived chats; move/archive/unarchive work.
- [ ] **Step 3: Commit.**

## Task 7: Wire props through MarkChat

**File:** `src/app/arc/_components/arc-chat.tsx` (re-read first)

- [ ] **Step 1:** Extend the `MarkChat` props with `projects`, `archived`, `showArchived` and pass them into `<ThreadSidebar … />`. No other behavior changes.
- [ ] **Step 2: Verify** `pnpm lint` + the page renders. **Commit.**

## Task 8: Polish — fix the sparse/floating thread layout

**File:** `src/app/arc/_components/message-list.tsx` (re-read first)

- [ ] **Step 1:** Ensure operator + Arc messages share the same centered, max-width column so short operator messages don't hug the far-right edge. The container is already `mx-auto … max-w-3xl`; verify nothing widens it and that the operator bubble's `items-end` aligns within that column (not the full panel). Tighten vertical rhythm if needed. Confirm visually against the thread screenshot issue.
- [ ] **Step 2: Verify** in the browser: a short "Hi" thread reads as a normal conversation, not floating pills. `pnpm vitest run` + `pnpm lint` green.
- [ ] **Step 3: Commit.**

---

## Self-Review
- **Spec coverage:** Projects (Tasks 1–3,5–7) ✓; Archive (Tasks 3–7) ✓; Polish (Task 8) ✓. Live activity = separate Phase 2 plan (intentionally not here).
- **Schema safety:** `arc_projects` required cols = operator, name (both provided); `project_id` nullable on conversations; reuses existing `set_updated_at`.
- **Type consistency:** `MarkConversation.projectId` / `project_id`, `MarkProject`, `createProject`/`listProjects`/`assignConversationToProject`/`unarchiveConversation`/`listArchivedConversations` names are consistent across persistence, actions, page, and tests.
- **Known caveat:** Tasks 6–7 give UI contracts rather than frozen line-by-line code because those components are under active parallel development; reconcile against the live files at build time (data/persistence/action tasks are exact and TDD-covered).
