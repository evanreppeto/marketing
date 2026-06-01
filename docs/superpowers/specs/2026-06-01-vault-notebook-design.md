# Vault — Obsidian-style linked knowledge base tab

**Date:** 2026-06-01
**Status:** Approved design, ready for implementation planning

## Summary

Add a new top-level tab, **Vault**, an Obsidian-style linked knowledge base shared
by the team and the Mark agent. Notes are markdown with `[[wiki-links]]` that resolve
to other notes *and* to live CRM records and personas. Each note has a backlinks
("linked references") panel and the vault has a graph view. Mark can author notes,
which flow through the existing Approvals guardrail before they read as "Published."

The tab ships in **scaffold-mode**, consistent with every other page in the app:
pre-populated reference notes, rendered markdown, working links and backlinks, a
graph view, and preview-only actions (`OperatorBar` + `ActionFeedback`). No
persistence and no real file I/O are wired yet.

The notes are stored as the **raw markdown a real Obsidian file would contain**
(YAML frontmatter, `[[note]]` / `[[note|alias]]` links, `#tags`, folders-as-collections)
so that when Mark later imports the team's actual Obsidian vault, real `.md` files
parse without a translation layer. The seeded notes are simply hand-written examples
in that real format.

## Goals

- A shared, interlinked knowledge base ("shared brain") for operators and Mark.
- Notes link to each other and to live CRM records / personas; backlinks surface
  automatically.
- A graph view that gives the signature Obsidian "see how it connects" moment.
- Mark can draft notes; drafts route through Approvals before publishing.
- Data shape matches real Obsidian files so Mark's future import is a drop-in.

## Non-goals (this phase)

- Real persistence or editing that saves (stays preview-only, like the rest of the app).
- Real file reading / vault import (represented as a preview-only "Sync vault" action).
- Wiring Mark's live runner to author notes (drafts are seeded; the approval deep-link
  pattern is reused).

## Architecture

### Routes & file layout

A new top-level tab **Vault**, placed in `navItems` between Mark and Settings:

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
  author: "Mark" | string;
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
  rendered muted, and also a useful "what Mark still needs to import" signal.
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

- **PageHeader** — eyebrow "Vault"; title e.g. "The shared brain for Mark and the team."
- **OperatorBar** — primary `Sync vault` (`?action=sync`), secondary `New note`
  (`?action=new`). Paired **ActionFeedback** explains the preview, e.g. "Preview: Mark
  would read N markdown files from your Obsidian vault and queue them for review. No
  files read yet."
- **Stat row** — Notes, Collections, Links resolved, Unresolved links, Mark drafts
  awaiting review.
- **Collections** — notes grouped by folder, each a `NoteCard` (title, summary, author
  pill, status pill, tag chips, updated). Mark-authored cards carry a "Mark" pill.
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
- **OperatorBar** actions: `Edit`, `Publish`, `Ask Mark to expand`, `Archive` — all
  preview-only.

## Mark integration

- Mark-authored notes default to status **Needs review**. The note page shows a banner
  deep-linking to `/approvals?item=…`, reusing the existing approval-guardrail pattern.
- "Published" notes read as canonical; "Draft" / "Needs review" are clearly marked.
- This mirrors the documented ContentEngine-style approval flow: Mark drafts → human
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

- Real Obsidian vault import: Mark reads `.md` files and queues them as Needs-review
  notes. The data shape above is already import-ready.
- Persistence: notes become real records; preview actions (`Sync vault`, `New note`,
  `Edit`, `Publish`, `Archive`) become real backend state transitions per the
  ContentEngine approval pattern.
