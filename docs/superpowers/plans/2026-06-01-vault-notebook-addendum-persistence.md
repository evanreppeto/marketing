# Vault Notebook — Persistence & Editing Addendum

> **For agentic workers:** This addendum revises the base plan
> (`2026-06-01-vault-notebook.md`) to make the Vault tab **editable with real Supabase
> persistence** (per spec Revision 1). Use superpowers:subagent-driven-development.

**Goal:** Turn the Vault from preview-only into a real, editable, Supabase-persisted notes surface — Vault tab only; every other page stays scaffold-mode.

## What carries over unchanged from the base plan

- **Task 1** — add `react-markdown` + `remark-gfm`.
- **Tasks 2–6** — all pure domain logic in `src/domain/notebook.ts` (frontmatter, wiki-link resolution, backlinks, renderable markdown, graph layout) + tests + barrel export. **No change.**
- **Tasks 8–10** — `note-body.tsx`, `note-card.tsx`, `backlinks-panel.tsx`, `note-graph.tsx`. **No change.**

## What this addendum changes or adds

- **Task 7 is REVISED** — the seed notes move to `src/lib/vault/seed-notes.ts` (so the lib layer can use them as fallback without importing from `src/app`). `_data/notebook.ts` imports them.
- **Tasks 11–13 of the base plan are SUPERSEDED** by Tasks A6–A8 below.
- New persistence/editing tasks **A1–A8** below.

Patterns mirrored from existing code: `src/lib/supabase/server.ts` (`isSupabaseAdminConfigured`, `getSupabaseAdminClient`), `src/lib/lead-ingestion/persistence.ts` (untyped `SupabaseClient` param to avoid regenerating `database.types.ts`), `src/lib/agent-operations/read-model.ts` (discriminated-union read-model), `src/app/agent-operations/actions.ts` (`"use server"` + `requireOperator()` + configured-guard + `revalidatePath` + `redirect`), and `supabase/migrations/20260528193000_agent_operations_scaffold.sql` (enum + table + RLS + `set_updated_at` trigger + indexes + seed).

---

## Task 7 (REVISED): Seed notes in lib + data wiring

**Files:**
- Create: `src/lib/vault/seed-notes.ts`
- Create: `src/app/notebook/_data/notebook.ts`

- [ ] **Step 1: Create the lib seed notes**

Create `src/lib/vault/seed-notes.ts` with `export const seedVaultNotes: VaultNote[] = [ ... ]` containing exactly the four seed notes from the base plan Task 7 (`emergency-homeowner-playbook`, `insurance-agent-handoff`, `apex-plumbing-co-intel`, `coverage-neutral-language-sop`), importing `type VaultNote` from `@/domain`. No imports from `src/app`.

- [ ] **Step 2: Create the data file that wires context**

Create `src/app/notebook/_data/notebook.ts`:
```ts
import { OFFICIAL_PERSONA_MAPPINGS, type LinkResolutionContext, type VaultNote } from "@/domain";

import { crmObjects } from "@/app/_data/growth-engine";
import { seedVaultNotes } from "@/lib/vault/seed-notes";

export const vaultNotes = seedVaultNotes;

export const vaultCollections = [
  { folder: "Playbooks", description: "Repeatable plays for converting and growing accounts." },
  { folder: "Partner Intel", description: "What we know about referral partners and trade allies." },
  { folder: "Persona Docs", description: "How each restoration persona thinks, decides, and converts." },
  { folder: "SOPs", description: "Operating procedures and guardrails the team follows." },
  { folder: "Field Notes", description: "Dated observations from jobs, calls, and the field." },
];

// Build the resolution context from live app data so wiki-links can point at
// real CRM records and personas, not just other notes. Pass the active notes
// (from Supabase or the seeds) so note-to-note links resolve correctly.
export function buildLinkContext(notes: VaultNote[] = vaultNotes): LinkResolutionContext {
  const noteMap = new Map(notes.map((n) => [n.slug, `/notebook/${n.slug}`]));

  const recordMap = new Map<string, string>();
  for (const object of crmObjects) {
    for (const row of object.sampleRows) {
      recordMap.set(row.id, `${object.href}/${row.id}`);
    }
  }

  const personaMap = new Map<string, string>(
    OFFICIAL_PERSONA_MAPPINGS.map((persona) => [persona, "/persona-intelligence"]),
  );

  return { notes: noteMap, records: recordMap, personas: personaMap };
}
```

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/vault/seed-notes.ts src/app/notebook/_data/notebook.ts
git commit -m "feat: seed vault notes in lib with app-side link context"
```

---

## Task A1: Supabase migration for vault_notes

**Files:**
- Create: `supabase/migrations/20260601120000_vault_notes.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260601120000_vault_notes.sql`:
```sql
-- Vault notes: the editable, Supabase-persisted knowledge base behind the Vault tab.
-- Notes are raw Obsidian-format markdown with [[wiki-links]]. Reuses the shared
-- set_updated_at() trigger function defined in earlier migrations.

create type public.vault_note_status as enum (
  'draft',
  'needs_review',
  'published',
  'archived'
);

create table public.vault_notes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(btrim(slug)) > 0),
  title text not null check (length(btrim(title)) > 0),
  folder text not null check (length(btrim(folder)) > 0),
  tags text[] not null default '{}'::text[],
  author text not null default 'Operator' check (length(btrim(author)) > 0),
  status public.vault_note_status not null default 'draft',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vault_notes_slug_idx on public.vault_notes(slug);
create index vault_notes_folder_idx on public.vault_notes(folder);
create index vault_notes_status_idx on public.vault_notes(status);

alter table public.vault_notes enable row level security;

create trigger vault_notes_set_updated_at
before update on public.vault_notes
for each row execute function public.set_updated_at();

-- Seed the same example notes the app uses as its offline fallback so a fresh
-- project shows a populated vault immediately.
insert into public.vault_notes (slug, title, folder, tags, author, status, body) values
  (
    'emergency-homeowner-playbook',
    'Emergency Homeowner Playbook',
    'Playbooks',
    array['homeowner', 'urgent'],
    'Evan',
    'published',
    E'# Emergency Homeowner Playbook\n\nWhen an [[persona_homeowner_emergency|emergency homeowner]] reports active water, call within 15 minutes.\n\n- Reassure first, document second.\n- Request photos before the truck rolls.\n- See live example: [[basement-flooding]].\n\nRelated: [[insurance-agent-handoff]].'
  ),
  (
    'insurance-agent-handoff',
    'Insurance Agent Handoff',
    'Playbooks',
    array['partner', 'coverage-neutral'],
    'Arc',
    'needs_review',
    E'# Insurance Agent Handoff\n\nGive the [[persona_insurance_agent|insurance agent]] a coverage-neutral path to refer a client.\n\nNever promise coverage. Lead with documentation.\n\nPartner record: [[north-branch-insurance]].'
  ),
  (
    'apex-plumbing-co-intel',
    'Apex Plumbing Co. — Partner Intel',
    'Partner Intel',
    array['partner', 'plumbing'],
    'Arc',
    'draft',
    E'# Apex Plumbing Co. — Partner Intel\n\n[[apex-plumbing-co]] stops the source and hands off property damage.\n\nBest channel: email then phone. Tie referrals to the [[emergency-homeowner-playbook]].\n\nTODO: confirm the owner''s after-hours contact (link target [[apex-after-hours]] not imported yet).'
  ),
  (
    'coverage-neutral-language-sop',
    'Coverage-Neutral Language SOP',
    'SOPs',
    array['compliance'],
    'Evan',
    'published',
    E'# Coverage-Neutral Language SOP\n\nApplies to every message aimed at the [[persona_insurance_agent|insurance agent]] persona.\n\n- No coverage promises.\n- No claim-approval language.\n- Used by [[insurance-agent-handoff]].'
  );
```

- [ ] **Step 2: Verify the SQL parses against the local Supabase stack (if available), else review by eye**

If a local Supabase CLI is configured, run `supabase db reset` against a dev project. If not available in this environment, carefully verify: enum created before table, `set_updated_at()` exists (it is defined in `20260527131500_initial_growth_engine_schema.sql` — confirm by grep), and the single-quote escaping in the `apex` note (`owner''s`) is correct.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260601120000_vault_notes.sql
git commit -m "feat: add vault_notes table migration"
```

---

## Task A2: Vault persistence layer + pure mapper tests

**Files:**
- Create: `src/lib/vault/persistence.ts`
- Create: `src/lib/vault/persistence.test.ts`

- [ ] **Step 1: Write the failing mapper test**

Create `src/lib/vault/persistence.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { rowToVaultNote, vaultNoteToRow, type VaultNoteRow } from "./persistence";
import type { VaultNote } from "@/domain";

const ROW: VaultNoteRow = {
  slug: "x",
  title: "X",
  folder: "Playbooks",
  tags: ["a", "b"],
  author: "Arc",
  status: "needs_review",
  body: "# X",
  updated_at: "2026-06-01T12:00:00.000Z",
};

describe("rowToVaultNote", () => {
  it("maps a db row to a VaultNote with display status and date", () => {
    expect(rowToVaultNote(ROW)).toEqual({
      slug: "x",
      title: "X",
      folder: "Playbooks",
      tags: ["a", "b"],
      author: "Arc",
      status: "Needs review",
      updated: "2026-06-01",
      body: "# X",
    });
  });

  it("defaults null tags and body", () => {
    const note = rowToVaultNote({ ...ROW, tags: null, body: null });
    expect(note.tags).toEqual([]);
    expect(note.body).toBe("");
  });
});

describe("vaultNoteToRow", () => {
  it("maps a VaultNote to a db row with enum status", () => {
    const note: VaultNote = {
      slug: "x", title: "X", folder: "Playbooks", tags: ["a"], author: "Arc",
      status: "Published", updated: "Today", body: "# X",
    };
    expect(vaultNoteToRow(note)).toEqual({
      slug: "x", title: "X", folder: "Playbooks", tags: ["a"], author: "Arc",
      status: "published", body: "# X",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/vault/persistence.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement the persistence layer**

Create `src/lib/vault/persistence.ts`:
```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { type NoteStatus, type VaultNote } from "@/domain";

export type VaultNoteRow = {
  slug: string;
  title: string;
  folder: string;
  tags: string[] | null;
  author: string;
  status: string; // db enum: draft | needs_review | published | archived
  body: string | null;
  updated_at: string | null;
};

const STATUS_FROM_DB: Record<string, NoteStatus> = {
  draft: "Draft",
  needs_review: "Needs review",
  published: "Published",
};

const STATUS_TO_DB: Record<NoteStatus, string> = {
  Draft: "draft",
  "Needs review": "needs_review",
  Published: "published",
};

export function rowToVaultNote(row: VaultNoteRow): VaultNote {
  return {
    slug: row.slug,
    title: row.title,
    folder: row.folder,
    tags: row.tags ?? [],
    author: row.author,
    status: STATUS_FROM_DB[row.status] ?? "Draft",
    updated: row.updated_at ? row.updated_at.slice(0, 10) : "—",
    body: row.body ?? "",
  };
}

export function vaultNoteToRow(note: VaultNote) {
  return {
    slug: note.slug,
    title: note.title,
    folder: note.folder,
    tags: note.tags,
    author: note.author,
    status: STATUS_TO_DB[note.status],
    body: note.body,
  };
}

const SELECT = "slug,title,folder,tags,author,status,body,updated_at";

export async function listVaultNotes(supabase: SupabaseClient): Promise<VaultNote[]> {
  const { data, error } = await supabase
    .from("vault_notes")
    .select(SELECT)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`vault_notes list failed: ${error.message}`);
  return ((data ?? []) as VaultNoteRow[]).map(rowToVaultNote);
}

export async function getVaultNoteBySlug(supabase: SupabaseClient, slug: string): Promise<VaultNote | null> {
  const { data, error } = await supabase
    .from("vault_notes")
    .select(SELECT)
    .eq("slug", slug)
    .neq("status", "archived")
    .maybeSingle<VaultNoteRow>();
  if (error) throw new Error(`vault_notes get failed: ${error.message}`);
  return data ? rowToVaultNote(data) : null;
}

export async function upsertVaultNote(supabase: SupabaseClient, note: VaultNote): Promise<void> {
  const { error } = await supabase.from("vault_notes").upsert(vaultNoteToRow(note), { onConflict: "slug" });
  if (error) throw new Error(`vault_notes upsert failed: ${error.message}`);
}

export async function setVaultNoteStatus(supabase: SupabaseClient, slug: string, status: NoteStatus): Promise<void> {
  const { error } = await supabase.from("vault_notes").update({ status: STATUS_TO_DB[status] }).eq("slug", slug);
  if (error) throw new Error(`vault_notes status update failed: ${error.message}`);
}

// Soft-delete: archived notes are excluded from all reads.
export async function archiveVaultNote(supabase: SupabaseClient, slug: string): Promise<void> {
  const { error } = await supabase.from("vault_notes").update({ status: "archived" }).eq("slug", slug);
  if (error) throw new Error(`vault_notes archive failed: ${error.message}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/vault/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vault/persistence.ts src/lib/vault/persistence.test.ts
git commit -m "feat: add vault_notes persistence layer with mapper tests"
```

---

## Task A3: Vault read-model with offline fallback

**Files:**
- Create: `src/lib/vault/read-model.ts`
- Create: `src/lib/vault/read-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/vault/read-model.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { getVaultNotes } from "./read-model";

describe("getVaultNotes (no Supabase configured)", () => {
  it("returns fallback status with seeded notes when env vars are unset", async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const model = await getVaultNotes();
      expect(model.status).toBe("fallback");
      expect(model.notes.length).toBeGreaterThan(0);
    } finally {
      if (prevUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/vault/read-model.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the read-model**

Create `src/lib/vault/read-model.ts`:
```ts
import { seedVaultNotes } from "./seed-notes";
import { getVaultNoteBySlug, listVaultNotes } from "./persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";
import type { VaultNote } from "@/domain";

const NOT_CONFIGURED = "Supabase is not configured. Showing example notes — saving is disabled until env vars are set.";

export type VaultNotesModel =
  | { status: "live"; notes: VaultNote[] }
  | { status: "fallback"; notes: VaultNote[]; message: string }
  | { status: "error"; notes: VaultNote[]; message: string };

export async function getVaultNotes(): Promise<VaultNotesModel> {
  if (!isSupabaseAdminConfigured()) {
    return { status: "fallback", notes: seedVaultNotes, message: NOT_CONFIGURED };
  }
  try {
    const notes = await listVaultNotes(getSupabaseAdminClient());
    return { status: "live", notes };
  } catch (error) {
    return { status: "error", notes: seedVaultNotes, message: error instanceof Error ? error.message : "Vault is unavailable." };
  }
}

export async function getVaultNote(slug: string): Promise<VaultNote | null> {
  if (!isSupabaseAdminConfigured()) {
    return seedVaultNotes.find((note) => note.slug === slug) ?? null;
  }
  try {
    return await getVaultNoteBySlug(getSupabaseAdminClient(), slug);
  } catch {
    return seedVaultNotes.find((note) => note.slug === slug) ?? null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/vault/read-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vault/read-model.ts src/lib/vault/read-model.test.ts
git commit -m "feat: add vault read-model with offline fallback"
```

---

## Task A4: Server actions

**Files:**
- Create: `src/app/notebook/actions.ts`

- [ ] **Step 1: Implement the actions**

Create `src/app/notebook/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOperator } from "@/lib/auth/operator";
import { archiveVaultNote, setVaultNoteStatus, upsertVaultNote } from "@/lib/vault/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import type { NoteStatus, VaultNote } from "@/domain";

const VALID_STATUSES: NoteStatus[] = ["Draft", "Needs review", "Published"];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function saveNoteAction(formData: FormData): Promise<void> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    redirect("/notebook?action=not-configured");
  }

  const title = String(formData.get("title") ?? "").trim();
  const folder = String(formData.get("folder") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const author = String(formData.get("author") ?? "Operator").trim() || "Operator";
  const statusRaw = String(formData.get("status") ?? "Draft");
  const status: NoteStatus = (VALID_STATUSES as string[]).includes(statusRaw) ? (statusRaw as NoteStatus) : "Draft";
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // Existing notes keep their slug (hidden field); new notes derive one from the title.
  const existingSlug = String(formData.get("slug") ?? "").trim();
  const slug = existingSlug || slugify(title);

  if (!title || !folder || !slug) {
    redirect("/notebook?action=invalid");
  }

  const note: VaultNote = { slug, title, folder, tags, author, status, updated: "", body };
  await upsertVaultNote(getSupabaseAdminClient(), note);

  revalidatePath("/notebook");
  revalidatePath(`/notebook/${slug}`);
  redirect(`/notebook/${slug}?action=saved`);
}

export async function publishNoteAction(formData: FormData): Promise<void> {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/notebook?action=invalid");

  if (!isSupabaseAdminConfigured()) {
    redirect("/notebook?action=not-configured");
  }

  await setVaultNoteStatus(getSupabaseAdminClient(), slug, "Published");
  revalidatePath("/notebook");
  revalidatePath(`/notebook/${slug}`);
  redirect(`/notebook/${slug}?action=published`);
}

export async function archiveNoteAction(formData: FormData): Promise<void> {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/notebook?action=invalid");

  if (!isSupabaseAdminConfigured()) {
    redirect("/notebook?action=not-configured");
  }

  await archiveVaultNote(getSupabaseAdminClient(), slug);
  revalidatePath("/notebook");
  redirect("/notebook?action=archived");
}
```

- [ ] **Step 2: Verify lint and types**

Run: `pnpm lint`
Expected: no errors. (Confirm `requireOperator` is exported from `@/lib/auth/operator` — it is used the same way in `src/app/agent-operations/actions.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/notebook/actions.ts
git commit -m "feat: add vault note server actions (save, publish, archive)"
```

---

## Task A5: Note editor component

**Files:**
- Create: `src/app/notebook/_components/note-editor.tsx`

- [ ] **Step 1: Implement the editor form**

Create `src/app/notebook/_components/note-editor.tsx`:
```tsx
import { buttonClasses } from "@/app/_components/page-header";
import { saveNoteAction } from "../actions";
import { vaultCollections } from "../_data/notebook";
import type { VaultNote } from "@/domain";

const STATUSES = ["Draft", "Needs review", "Published"] as const;
const FIELD = "w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const LABEL = "text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]";

export function NoteEditor({ note }: { note?: VaultNote }) {
  return (
    <form action={saveNoteAction} className="space-y-4">
      {note ? <input name="slug" type="hidden" value={note.slug} /> : null}

      <div>
        <label className={LABEL} htmlFor="title">Title</label>
        <input className={`${FIELD} mt-1`} defaultValue={note?.title ?? ""} id="title" name="title" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="folder">Collection</label>
          <select className={`${FIELD} mt-1`} defaultValue={note?.folder ?? vaultCollections[0].folder} id="folder" name="folder">
            {vaultCollections.map((c) => (
              <option key={c.folder} value={c.folder}>{c.folder}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="status">Status</label>
          <select className={`${FIELD} mt-1`} defaultValue={note?.status ?? "Draft"} id="status" name="status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="author">Author</label>
          <input className={`${FIELD} mt-1`} defaultValue={note?.author ?? "Operator"} id="author" name="author" />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="tags">Tags (comma separated)</label>
        <input className={`${FIELD} mt-1`} defaultValue={note?.tags.join(", ") ?? ""} id="tags" name="tags" placeholder="partner, urgent" />
      </div>

      <div>
        <label className={LABEL} htmlFor="body">Markdown</label>
        <textarea className={`${FIELD} mt-1 min-h-[320px] font-mono`} defaultValue={note?.body ?? ""} id="body" name="body" />
        <p className="mt-1 text-xs text-[var(--text-muted)]">Use Obsidian-style <code>[[wiki-links]]</code> to link notes, CRM records, or personas.</p>
      </div>

      <div className="flex justify-end">
        <button className={buttonClasses({ variant: "primary" })} type="submit">{note ? "Save changes" : "Create note"}</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/notebook/_components/note-editor.tsx
git commit -m "feat: add vault note editor form"
```

---

## Task A6: New and edit pages

**Files:**
- Create: `src/app/notebook/new/page.tsx`
- Create: `src/app/notebook/[noteSlug]/edit/page.tsx`

- [ ] **Step 1: Create the "new note" page**

Create `src/app/notebook/new/page.tsx`:
```tsx
import { connection } from "next/server";

import { AppShell } from "../../_components/app-shell";
import { PageHeader, Panel } from "../../_components/page-header";
import { NoteEditor } from "../_components/note-editor";

export default async function NewNotePage() {
  await connection();
  return (
    <AppShell active="/notebook">
      <PageHeader eyebrow="Vault" title="New note" description="Create a note. Use [[wiki-links]] to connect it to other notes, CRM records, and personas." />
      <Panel>
        <NoteEditor />
      </Panel>
    </AppShell>
  );
}
```

- [ ] **Step 2: Create the "edit note" page**

Create `src/app/notebook/[noteSlug]/edit/page.tsx`:
```tsx
import { notFound } from "next/navigation";

import { AppShell } from "../../../_components/app-shell";
import { PageHeader, Panel } from "../../../_components/page-header";
import { NoteEditor } from "../../_components/note-editor";
import { getVaultNote } from "@/lib/vault/read-model";

type EditPageProps = { params: Promise<{ noteSlug: string }> };

export default async function EditNotePage({ params }: EditPageProps) {
  const { noteSlug } = await params;
  const note = await getVaultNote(noteSlug);
  if (!note) notFound();

  return (
    <AppShell active="/notebook">
      <PageHeader eyebrow={note.folder} title={`Edit: ${note.title}`} description="Update the note and save. Changes persist to Supabase." />
      <Panel>
        <NoteEditor note={note} />
      </Panel>
    </AppShell>
  );
}
```

> Note: the edit route is dynamic and reads live data — do NOT add `generateStaticParams` here.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: build succeeds; `/notebook/new` and `/notebook/[noteSlug]/edit` appear.

- [ ] **Step 4: Commit**

```bash
git add src/app/notebook/new/page.tsx "src/app/notebook/[noteSlug]/edit/page.tsx"
git commit -m "feat: add vault new and edit note pages"
```

---

## Task A7: Vault home page (read-model wired) — SUPERSEDES base Task 11

**Files:**
- Create: `src/app/notebook/page.tsx`

Same as base plan Task 11, with these differences:
- Read notes from the read-model instead of the static import:
  ```ts
  import { getVaultNotes } from "@/lib/vault/read-model";
  // ...
  const model = await getVaultNotes();
  const notes = model.notes;
  ```
  Use `notes` everywhere the base plan used `vaultNotes` (stats, collections, graph). Build the link context with the live notes: `const ctx = buildLinkContext(notes);`
- `New note` is a real link to `/notebook/new` (not `?action=new`). Keep `Sync vault` as a preview action (`?action=sync`) — real import is still a future phase.
- Add a status banner above the OperatorBar when `model.status !== "live"`:
  ```tsx
  {model.status !== "live" ? (
    <div className="mb-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
      <span className="font-semibold">{model.status === "fallback" ? "Read-only: " : "Vault error: "}</span>
      {model.message}
    </div>
  ) : null}
  ```
- `actionMessages` adds: `"not-configured": "Saving needs Supabase env vars. Set them and apply the vault_notes migration to edit notes."`, `saved`, `published`, `archived`, `invalid` keys with short confirmations.

Otherwise identical to base Task 11 (PageHeader, OperatorBar with Sync vault, stat row, collections of `NoteCard`, graph panel using `NoteGraph`).

- [ ] **Step 1: Implement per above**
- [ ] **Step 2: `pnpm build`** — Expected: succeeds, `/notebook` present.
- [ ] **Step 3: Commit** — `git commit -m "feat: add vault home page wired to read-model"`

---

## Task A8: Note detail page (real actions) — SUPERSEDES base Task 12

**Files:**
- Create: `src/app/notebook/[noteSlug]/page.tsx`

Same as base plan Task 12, with these differences:
- Read the note from the read-model and the full list for backlinks:
  ```ts
  import { getVaultNote, getVaultNotes } from "@/lib/vault/read-model";
  // ...
  const note = await getVaultNote(noteSlug);
  if (!note) notFound();
  const { notes } = await getVaultNotes();
  const ctx = buildLinkContext(notes);
  const backlinks = computeBacklinks(notes, note.slug);
  ```
- `generateStaticParams` is REMOVED (data is now dynamic). The page renders on demand.
- Wire real actions (import from `../actions`):
  - `Edit` → `<Link href={`/notebook/${note.slug}/edit`}>` styled as ghost button.
  - `Publish` → a `<form action={publishNoteAction}>` with a hidden `slug` input and a primary submit button. Only show it when `note.status !== "Published"`.
  - `Archive` → a `<form action={archiveNoteAction}>` with a hidden `slug` input and a ghost submit button.
  - Drop the preview-only `Ask Arc to expand` button (out of scope for editing; can return later).
- Keep the Arc "Needs review" banner with the `/approvals?item=…` deep-link.
- `actionMessages` includes `saved` and `published` confirmations (the page is redirected to with `?action=saved` / `?action=published`).

- [ ] **Step 1: Implement per above**
- [ ] **Step 2: `pnpm build`** — Expected: succeeds.
- [ ] **Step 3: Commit** — `git commit -m "feat: add vault note detail page with real edit/publish/archive"`

---

## Base Task 13 (nav) and Task 14 (final verification) still apply

- **Task 13** — add the Vault entry to `console-frame.tsx` navItems + `vault-icon.png`. Unchanged.
- **Task 14 (REVISED final verification)** — in addition to `pnpm test` / `pnpm lint` / `pnpm build`, the manual smoke check now covers editing:
  - Without Supabase env: `/notebook` shows the read-only fallback banner; `New note`/`Save`/`Publish` redirect to `?action=not-configured` (no crash).
  - With Supabase env + migration applied: create a note via `/notebook/new` → it appears on the home page and its detail page; edit it via `…/edit` → changes persist; `Publish` a Arc draft → status flips to Published; `Archive` → it disappears from listings.
  - Note explicitly in the report whether the configured-Supabase round-trip was actually exercised or only the fallback path (do not claim the DB path works if it was not run).

## Self-review notes (addendum)

- **Spec Revision 1 coverage:** migration (A1), persistence + mappers (A2), read-model fallback (A3), server actions (A4), editor (A5), new/edit pages (A6), home wired to read-model (A7), detail with real actions (A8), revised verification (Task 14). All Revision 1 requirements map to tasks.
- **Layering:** seed notes live in `src/lib/vault/seed-notes.ts` so `lib` never imports from `app`; `app` imports from `lib` (correct direction).
- **No `database.types.ts` regeneration:** persistence takes an untyped `SupabaseClient`, mirroring `lead-ingestion/persistence.ts`.
- **Type consistency:** `VaultNote`, `NoteStatus`, `VaultNoteRow`, `VaultNotesModel`, `getVaultNotes`, `getVaultNote`, `upsertVaultNote`, `setVaultNoteStatus`, `archiveVaultNote`, `saveNoteAction`, `publishNoteAction`, `archiveNoteAction` are used identically across files.
