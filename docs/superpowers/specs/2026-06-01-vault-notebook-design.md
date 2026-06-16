# Vault — Obsidian-style linked knowledge base tab

**Date:** 2026-06-01
**Status:** Approved design — **REVISED 2026-06-01 to be editable with real Supabase persistence (see Revision 1 at the bottom).**

> **Revision 1 supersedes the "scaffold-mode / preview-only / no persistence" decisions
> throughout this document.** The Vault tab is now a *real, editable, Supabase-persisted*
> surface — the app's first editable page beyond the lead-ingestion API. The original
> sections below are kept for history; where they say "preview-only," "no persistence,"
> or "no writes," read the Revision 1 section as authoritative. Scope of editability is
> the Vault tab ONLY — every other page stays scaffold-mode per `CLAUDE.md`.

## Summary

Add a new top-level tab, **Vault**, an Obsidian-style linked knowledge base shared
by the team and the Arc agent. Notes are markdown with `[[wiki-links]]` that resolve
to other notes *and* to live CRM records and personas. Each note has a backlinks
("linked references") panel and the vault has a graph view. Arc can author notes,
which flow through the existing Approvals guardrail before they read as "Published."

The tab ships in **scaffold-mode**, consistent with every other page in the app:
pre-populated reference notes, rendered markdown, working links and backlinks, a
graph view, and preview-only actions (`OperatorBar` + `ActionFeedback`). No
persistence and no real file I/O are wired yet.

The notes are stored as the **raw markdown a real Obsidian file would contain**
(YAML frontmatter, `[[note]]` / `[[note|alias]]` links, `#tags`, folders-as-collections)
so that when Arc later imports the team's actual Obsidian vault, real `.md` files
parse without a translation layer. The seeded notes are simply hand-written examples
in that real format.

## Goals

- A shared, interlinked knowledge base ("shared brain") for operators and Arc.
- Notes link to each other and to live CRM records / personas; backlinks surface
  automatically.
- A graph view that gives the signature Obsidian "see how it connects" moment.
- Arc can draft notes; drafts route through Approvals before publishing.
- Data shape matches real Obsidian files so Arc's future import is a drop-in.

## Non-goals (this phase)

- Real persistence or editing that saves (stays preview-only, like the rest of the app).
- Real file reading / vault import (represented as a preview-only "Sync vault" action).
- Wiring Arc's live runner to author notes (drafts are seeded; the approval deep-link
  pattern is reused).

## Architecture

### Routes & file layout

A new top-level tab **Vault**, placed in `navItems` between Arc and Settings:

```ts
// src/app/_data/growth-engine.ts → navItems
{ label: "Vault", href: "/notebook", icon: "notebook" }
```

Plus a `notebook` case in the sidebar icon map in `src/app/_components/app-shell.tsx`.

Two routes, mirroring the CRM list + dynamic detail pattern:

```
src/app/notebook/
  page.tsx                      # vault home (static)
  [noteSlug]/page.tsx           # single note (dynamic)
  _components/
    note-card.tsx               # note tile for the home grid
    backlinks-panel.tsx         # "Linked references"
    note-graph.tsx              # server-rendered SVG link graph
    note-body.tsx               # react-markdown render + wiki-link resolution
  _data/
    notebook.ts                 # seeded notes + collections (raw markdown bodies)
```

Pure, deterministic logic lives in **`src/domain/notebook.ts`** with tests in
`src/domain/__tests__/notebook.test.ts`. The route and `_components` are thin views
over that domain logic, consistent with how the repo keeps routing/scoring logic in
`src/domain/` and unit-tests it.

### Data model

A seeded note, stored as the raw markdown a real vault file would contain:

```ts
type VaultNote = {
  slug: string;          // derived from filename, e.g. "apex-plumbing-co-intel"
  title: string;         // frontmatter `title:` or first H1
  folder: string;        // vault folder → collection (Playbooks, Partner Intel, …)
  tags: string[];        // frontmatter tags + inline #tags
  author: "Arc" | string;
  status: "Published" | "Draft" | "Needs review";
  updated: string;
  body: string;          // raw markdown, exactly as it would sit on disk
};
```

Collections are derived from `folder`. Seeded folders: Playbooks, Partner Intel,
Persona Docs, SOPs, Field Notes.

### Domain logic (`src/domain/notebook.ts`, pure, unit-tested)

- `parseFrontmatter(raw)` → `{ frontmatter, body }`. Minimal YAML (title, tags,
  author, status). No dependency.
- `extractLinks(body)` → resolves every `[[target]]` / `[[target|alias]]` into a typed
  link `{ kind: "note" | "record" | "persona" | "unresolved", href, label }`. Targets
  are checked against: note slugs, CRM record ids (from `crmObjects` sample rows), and
  persona keys (`OFFICIAL_PERSONA_MAPPINGS`). Unmatched targets become `unresolved` —
  rendered muted, and also a useful "what Arc still needs to import" signal.
- `computeBacklinks(allNotes, slug)` → every note whose body links to `slug`,
  deterministic and sorted.

### Markdown rendering

`note-body.tsx` uses **react-markdown** plus a **remark wiki-link plugin** so arbitrary
real vault files (tables, nested formatting, etc.) render with good fidelity. The
wiki-link plugin defers resolution to `extractLinks` semantics: resolved links become
Next `<Link>`s to notes / CRM records / personas; unresolved links render muted with no
destination (Obsidian style).

> Implementation note: per `AGENTS.md`, verify react-markdown v9 compatibility with
> Next 16 / React 19 against the bundled docs before wiring. It is expected to work.

## Pages

### Vault home (`/notebook`)

- **PageHeader** — eyebrow "Vault"; title e.g. "The shared brain for Arc and the team."
- **OperatorBar** — primary `Sync vault` (`?action=sync`), secondary `New note`
  (`?action=new`). Paired **ActionFeedback** explains the preview, e.g. "Preview: Arc
  would read N markdown files from your Obsidian vault and queue them for review. No
  files read yet."
- **Stat row** — Notes, Collections, Links resolved, Unresolved links, Arc drafts
  awaiting review.
- **Collections** — notes grouped by folder, each a `NoteCard` (title, summary, author
  pill, status pill, tag chips, updated). Arc-authored cards carry a "Arc" pill.
- **Graph teaser** — compact panel linking to / embedding the full graph.

### Note page (`/notebook/[noteSlug]`)

- Rendered markdown body with resolved/unresolved `[[links]]`.
- Frontmatter strip: folder, tags, author, status, updated.
- **Backlinks panel** ("Linked references") via `computeBacklinks`.
- **Outgoing links** grouped by kind (Notes / Records / Personas).
- **`note-graph.tsx`** — server-rendered SVG, precomputed node positions (no physics
  lib, no glow). Nodes = notes + linked records/personas; edges = links. Home page shows
  the whole vault; a note page shows a local neighborhood with the current note
  emphasized. Restoration palette only, per `DESIGN.md`.
- **OperatorBar** actions: `Edit`, `Publish`, `Ask Arc to expand`, `Archive` — all
  preview-only.

## Arc integration

- Arc-authored notes default to status **Needs review**. The note page shows a banner
  deep-linking to `/approvals?item=…`, reusing the existing approval-guardrail pattern.
- "Published" notes read as canonical; "Draft" / "Needs review" are clearly marked.
- This mirrors the documented ContentEngine-style approval flow: Arc drafts → human
  approves / declines / requests revision / archives.

## Design system

Follows `DESIGN.md`: Command Charcoal / Canvas White / Restoration Red palette; no
emojis; no purple/neon AI aesthetic; the graph uses restoration-palette nodes/edges,
not glowing graph-database visuals. Reuses `PageHeader`, `Panel`, `StatusPill`,
`OperatorBar`, `ActionFeedback`, `EmptyState` from `_components/page-header.tsx` before
adding any new layout primitive.

## Testing

`src/domain/__tests__/notebook.test.ts`:

- Frontmatter parsing (title, tags, author, status; missing fields).
- Wiki-link resolution across all four kinds: note, record, persona, unresolved.
- Alias handling (`[[target|label]]`).
- Backlink computation, including notes with unresolved links.

## Future phases (out of scope here)

- Real Obsidian vault import: Arc reads `.md` files and queues them as Needs-review
  notes. The data shape above is already import-ready.
- Persistence: notes become real records; preview actions (`Sync vault`, `New note`,
  `Edit`, `Publish`, `Archive`) become real backend state transitions per the
  ContentEngine approval pattern.

---

# Revision 1 — Editable Vault with real Supabase persistence (2026-06-01)

**Change:** The Vault tab is no longer preview-only. Notes are **created, edited, published,
and deleted for real**, persisted in Supabase. This pulls the "Persistence" future-phase
above into this build. **Scope is the Vault tab only**; all other pages remain scaffold-mode.

This aligns with `CLAUDE.md`'s product posture ("build durable records, approvals, and
state transitions first") and reuses the app's established persistence patterns rather than
inventing new ones.

## What stays the same

- All **pure domain logic** (`src/domain/notebook.ts`): `parseFrontmatter`, `extractLinks`,
  `resolveWikiTarget`, `computeBacklinks`, `toRenderableMarkdown`, `computeGraphLayout`.
  Unchanged and still unit-tested.
- **Rendering**: `react-markdown` + `remark-gfm`, wiki-links resolved by our domain code.
- **Note shape** (`VaultNote`): identical fields, now also persisted as a DB row.
- The graph view, backlinks panel, note cards, and collections grouping.

## New persistence architecture (mirrors existing patterns)

- **Migration** `supabase/migrations/<timestamp>_vault_notes.sql`:
  - `vault_note_status` enum: `draft`, `needs_review`, `published`, `archived`.
  - `vault_notes` table: `id uuid pk`, `slug text unique not null`, `title text not null`,
    `folder text not null`, `tags text[] not null default '{}'`, `author text not null`,
    `status vault_note_status not null default 'draft'`, `body text not null default ''`,
    `created_at`, `updated_at timestamptz`. RLS enabled; `set_updated_at()` trigger;
    indexes on `slug`, `folder`, `status`. Seeds the same example notes as the fallback data.
- **`src/lib/vault/persistence.ts`** — takes an untyped `SupabaseClient` (like
  `lead-ingestion/persistence.ts`, avoiding `database.types.ts` regeneration):
  `listVaultNotes`, `getVaultNoteBySlug`, `upsertVaultNote`, `setVaultNoteStatus`,
  `deleteVaultNote`, plus pure `rowToVaultNote` / `vaultNoteToRow` mappers (unit-tested).
- **`src/lib/vault/read-model.ts`** — `getVaultNotes()` / `getVaultNote(slug)` return a
  discriminated result: `{ status: "live", notes }` when Supabase is configured and healthy;
  `{ status: "fallback", notes, message }` using the seeded notes when env vars are absent
  (parallels the ingest route's `202 not_configured`); `{ status: "error", notes, message }`
  on a query failure (still renders seeds, shows a banner). Pages always render `result.notes`.
- **`src/app/notebook/actions.ts`** (`"use server"`) — `saveNoteAction` (create or update by
  slug), `publishNoteAction`, `archiveNoteAction`/`deleteNoteAction`. Each: `requireOperator()`,
  `isSupabaseAdminConfigured()` guard → `redirect("/notebook?action=not-configured")` if unset,
  perform the write, `revalidatePath("/notebook")` (+ the note path), then `redirect`.

## New editing UI

- **`src/app/notebook/_components/note-editor.tsx`** — a form (`action={saveNoteAction}`):
  title, folder (select over `vaultCollections`), tags (comma input), status (select over the
  enum), and a `<textarea>` for the raw markdown body. Reused by create and edit.
- **`src/app/notebook/new/page.tsx`** — blank editor to create a note.
- **`src/app/notebook/[noteSlug]/edit/page.tsx`** — editor pre-filled from the note.
- **Note detail page** wires real actions: `Edit` links to `…/edit`; `Publish` and
  `Archive`/`Delete` are form buttons posting to the server actions; the Arc "Needs review"
  banner remains and `Publish` performs the real `draft/needs_review → published` transition.
- **Vault home**: `New note` links to `/notebook/new` (not a preview); a banner shows when the
  read-model status is `fallback` (Supabase not configured) or `error`.

## Behavior without Supabase configured

The tab still renders (seeded fallback notes, read-only). Any write action redirects to
`/notebook?action=not-configured` with an explanatory banner — it does **not** error. Real
editing requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (and the migration
applied). This matches how the ingest route degrades.

## Testing additions

- Pure mappers `rowToVaultNote` / `vaultNoteToRow` unit-tested (tags array handling, status
  enum ↔ display mapping, slug/title).
- Read-model fallback path unit-tested by calling `getVaultNotes()` with Supabase env unset and
  asserting `status: "fallback"` with seeded notes.
- Server actions verified manually against a configured Supabase project (create → edit →
  publish → archive round-trip), since they perform real I/O.
