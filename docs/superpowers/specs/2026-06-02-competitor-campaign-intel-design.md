# Competitor Campaign Intel — Design

**Date:** 2026-06-02
**Status:** Approved design, pending spec review
**Author:** Evan + Claude (brainstorming session)

## Summary

Give the Hermes agent (surfaced as **Mark**, a Claude computer-use agent running on a
Mac mini) a structured, approval-light way to **analyze competitors' marketing
campaigns** and file the findings back into the Growth Engine. Mark browses public
ad libraries, SimilarWeb, and competitor landing pages via computer use, then POSTs
structured findings to a new bearer-gated backend endpoint. The backend normalizes
and persists them as a typed `competitor_campaigns` record **and** an auto-generated
human-readable Obsidian vault note, both in a `needs_review` state for a light
operator confirmation.

This is the **first** of two related sub-projects. Lead discovery is a separate spec
that will build on the same "agent findings intake" foundation.

## Goals

- A durable, queryable record of what competitors are running (creatives, channel
  mix, estimated spend, keywords, positioning).
- A human-readable vault note per finding for browsable reference (the "Obsidian
  vault for reference" ask).
- A repeatable procedure (Claude **skill**) that tells Mark exactly how to scrape
  each source and where to POST results — this is the "prompt" that steers Mark.
- Human-in-the-loop: nothing scraped is auto-trusted; intel lands as `needs_review`.

## Non-goals (v1 — YAGNI)

- Lead discovery (separate spec, next).
- Feeding competitor intel into the campaign draft engine (the link is stored, but
  consumption is out of scope).
- Auto-publishing notes, scheduled/recurring scrapes, dashboards/charts.
- Seeded "Competitor Intel SOP" vault note (deferred to a later iteration).
- A new auth token (we reuse `HERMES_AGENT_API_TOKEN`).
- Any outbound action — this feature is read-only intel and never triggers outbound.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Agent runtime | Claude computer-use agent on a Mac mini (can read skills + reference docs) |
| First sub-project | Competitor analysis (lead discovery follows) |
| Intel destination | Structured `competitor_campaigns` table **+** auto-generated vault note |
| v1 sources | Meta Ad Library, Google Ads Transparency, SimilarWeb, competitor landing pages |
| Review model | Light status review (`needs_review` → `confirmed`/`archived`); no `approval_items`, no dispatch locks |
| Integration | Dedicated bearer-gated API endpoint, mirroring `POST /api/v1/hermes/runs` |
| Auth token | Reuse `HERMES_AGENT_API_TOKEN` |
| Operator UI | A section under Mark / agent-operations (not a new top-level nav item) |

## Architecture

Follows the existing layering convention: `src/domain/` (pure) → `src/lib/<feature>/`
(I/O) → `src/app/<route>/` (views), with a `src/lib/repos/` entry for typed table
access.

### Domain — `src/domain/competitor-intel.ts` (pure, no I/O)

- `parseCompetitorIntelPayload(input: unknown): CompetitorIntelRequest` — Zod schema,
  validates + applies defaults (mirrors `hermes/contracts.ts` style).
- `competitorIntelDedupeKey(record): string` — stable key from
  `source + competitorName + capturedDate` for idempotency / dedupe.
- `scoreCompetitorActivity(record): { activityLevel, signals }` — simple
  deterministic heuristic (e.g. number of active creatives, recency) so records are
  sortable without a model.
- `renderIntelNoteMarkdown(record): { slug, title, folder, tags, body }` — produces
  the Obsidian-format markdown (with `[[wiki-links]]`) for the vault note.
- Re-exported through `src/domain/index.ts`; unit-tested in
  `src/domain/__tests__/competitor-intel.test.ts`.

### Lib (I/O) — `src/lib/competitor-intel/persistence.ts`

- `persistCompetitorIntel(request, client?)` — guarded by `isSupabaseAdminConfigured()`.
  In one logical run:
  1. Upsert/lookup the `agents` row for Mark (reuse existing helper pattern).
  2. Insert a `competitor_campaigns` row with `status='needs_review'`.
  3. Insert a `vault_notes` row from `renderIntelNoteMarkdown` (folder
     `Competitor Intel`, `author='Mark'`, `status='needs_review'`).
  4. Link them via `competitor_campaigns.vault_note_slug`.
- Returns `{ competitorCampaignId, vaultNoteSlug, status }`.

### Repo — `src/lib/repos/competitor-campaigns.ts`

Thin typed access (list, getById, updateStatus) mirroring `src/lib/repos/leads`.
Used by the operator review UI.

### API — `POST /api/v1/hermes/competitor-intel/route.ts`

Mirrors `src/app/api/v1/hermes/runs/route.ts` exactly:

- `checkBearerToken(request, "HERMES_AGENT_API_TOKEN")` → `401`/`not_configured`.
- `isSupabaseAdminConfigured()` guard → `503 not_configured`.
- Parse JSON body → `400` on invalid JSON.
- `parseCompetitorIntelPayload` → `400` on Zod error (with structured issues).
- `persistCompetitorIntel` → `201` on success, `502` on persistence error.

Response codes are load-bearing, matching the house style: `400` validation,
`503` not_configured, `201` persisted, `502` persistence error.

### Operator UI — section under Mark / agent-operations

A "Competitor Intel" panel inside the existing agent-operations route (reusing
`PageHeader`/`Panel`/`StatusPill` from `src/app/_components/page-header.tsx`). Lists
`needs_review` records with source, competitor, captured date, summary, and a link to
the generated vault note. Operator actions: **Confirm** (→ `confirmed`) and
**Archive** (→ `archived`) via `"use server"` actions gated by `requireOperator()` +
`isSupabaseAdminConfigured()` + `revalidatePath`, following the vault wired-feature
pattern. (No `approval_items`.)

## Data model — new migration `..._competitor_intel.sql`

Do not edit shipped migrations; add a new timestamp-prefixed file.

```sql
create type public.competitor_intel_status as enum (
  'needs_review', 'confirmed', 'archived'
);

create type public.competitor_intel_source as enum (
  'meta_ad_library', 'google_ads_transparency', 'similarweb', 'landing_page'
);

create table public.competitor_campaigns (
  id uuid primary key default gen_random_uuid(),
  source public.competitor_intel_source not null,
  competitor_name text not null check (length(btrim(competitor_name)) > 0),
  competitor_url text,
  persona public.persona_mapping,                  -- nullable; reuse existing enum
  status public.competitor_intel_status not null default 'needs_review',
  captured_at timestamptz not null default now(),
  summary text not null default '',
  channel_mix jsonb not null default '{}'::jsonb,   -- e.g. {paid: 60, organic: 40}
  est_spend text,                                   -- free text (SimilarWeb estimates are ranges)
  top_keywords text[] not null default '{}'::text[],
  ad_creatives jsonb not null default '[]'::jsonb,  -- [{headline, body, media_url, ...}]
  raw_payload jsonb not null default '{}'::jsonb,   -- full scraped capture for audit
  vault_note_slug text,                             -- link to generated vault_notes row
  created_by_agent_id uuid references public.agents(id),
  run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index competitor_campaigns_source_idx on public.competitor_campaigns(source);
create index competitor_campaigns_status_idx on public.competitor_campaigns(status);
create index competitor_campaigns_name_idx on public.competitor_campaigns(competitor_name);

alter table public.competitor_campaigns enable row level security;

create trigger competitor_campaigns_set_updated_at
before update on public.competitor_campaigns
for each row execute function public.set_updated_at();
```

The human-readable note reuses the existing `vault_notes` table (no schema change):
folder `Competitor Intel`, `author='Mark'`, `status='needs_review'`.

## Data flow

1. Mark (Mac mini, computer use) scrapes a source per the skill procedure.
2. Mark POSTs structured JSON to `/api/v1/hermes/competitor-intel` with the bearer token.
3. Route validates token + config + payload.
4. `persistCompetitorIntel` writes the `competitor_campaigns` row (`needs_review`) and
   a linked `vault_notes` row, returns ids.
5. Operator opens the Competitor Intel section under Mark/agent-operations, reviews,
   and confirms or archives.
6. Confirmed intel is queryable (repo) and available to future features (draft engine
   consumption is out of v1 scope).

## The Claude skill + vault reference

- **Skill** (e.g. `competitor-intel-scout`): a repeatable procedure document that tells
  Mark which sources to use, how to navigate each (Meta Ad Library, Google Ads
  Transparency, SimilarWeb, landing pages), exactly what fields to extract, and the
  **exact POST endpoint + payload shape**. Includes a ToS caution for SimilarWeb:
  prefer spot-checks, respect rate limits / robots, and treat output as `needs_review`.
  This is the "prompt" that steers Mark.
- **Deferred — seeded vault note** ("Competitor Intel SOP"): durable domain context
  (target competitors, priority ZIPs, what "good signal" looks like). Deferred to a
  later iteration; not built in v1.

Skill authoring will follow the `writing-skills` skill when we get to implementation.

## Testing

- **Domain** (`src/domain/__tests__/competitor-intel.test.ts`): payload parse
  accept/reject, dedupe key stability, activity scoring, markdown rendering.
- **Route** (`competitor-intel/route.test.ts`, mirroring `ping/route.test.ts`):
  `401` no token, `503` not configured, `400` bad payload, `201` happy path with a
  mocked Supabase client.
- **Persistence**: covered via a mocked client in the route/persistence tests, matching
  the vault persistence test approach.

## Error handling

- Invalid/missing token → `401` (or `not_configured` if env unset).
- Supabase not configured → `503` (graceful degrade; no row written).
- Invalid JSON / Zod failure → `400` with structured issues.
- Persistence failure → `502`.
- Partial write safety: if the vault note insert fails after the record insert, the
  record still persists (note slug left null); the operator UI tolerates a missing note.

## Open questions / follow-ups

- Exact placement + visual treatment of the Competitor Intel panel within
  agent-operations (resolve during implementation against `DESIGN.md`).
- Lead discovery sub-project: separate spec after this ships.
