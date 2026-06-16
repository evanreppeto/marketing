# Per-Org Persona Taxonomy Design

**Date:** 2026-06-12
**Status:** Draft for review
**Scope:** First productization slice — make persona definitions org-scoped data instead of a hardcoded enum + code constant, so a second customer organization can define its own personas.

## Context

The Growth Engine is being productized from a single-tenant BSR app into a
multi-tenant marketing product. An approved V2 database baseline
(`supabase/v2/`) already establishes the structural groundwork: an
`organizations` table, an `org_id` column on every product table defaulting to
the seeded BSR org, a `persona_definitions` table, and an org-scoped
`vault_notes` table.

The V2 baseline is **BSR-first operationally, SaaS-ready structurally** — but
three things remain hard-wired to BSR. The deepest is the persona model:
personas are still locked to BSR's exact twelve values at the database-type
level via a Postgres enum, so onboarding a second organization is impossible.
This slice removes that blocker.

The V2 baseline SQL **has not been applied to a database yet**, so the enum is
removed at the source rather than migrated on a live table.

## Problem

Persona identity is hardcoded in two places that are global to the whole app:

1. `src/domain/personas.ts` — the twelve personas as a frozen code constant
   (`OFFICIAL_PERSONA_MAPPINGS`), with validators that check against it.
2. The `persona_mapping` Postgres enum in `supabase/v2/migrations/20260612160000_v2_baseline.sql`
   — and **every** `persona` column across CRM, campaign, and knowledge tables
   is typed as that enum, including `persona_definitions.key` itself.

An enum and a code constant are global to the database and the app. Every tenant
shares them. A restoration company and a wedding photographer cannot both use
the product, because they cannot have different personas.

## Product Decisions

- **Opinionated schema, per-org values.** A persona keeps a fixed *shape* — a
  key, a label, an audience grouping, a sort order, an active flag. Each org
  supplies its own *rows*. Domain logic (scoring, routing) stays generic over
  the shape; it does not become per-org configurable in this slice.
- **Persona *identity* is per-org; persona *strategy* stays BSR-default.**
  Persona-keyed business logic (CTA rules and any scoring weights in
  `src/lib/persona-intelligence/cta-rules.ts`, Arc contracts) keeps its
  current BSR mapping and **degrades gracefully** for personas it does not
  recognize. Making that strategy layer per-org is an explicit future slice.
- **App-layer validation, not database constraints.** Persona validity is
  enforced in the app against the org's active `persona_definitions` rows. No
  cross-table composite foreign keys — the persona columns stay free text. This
  keeps the schema light and matches how the app already treats `persona` as a
  string on records.
- **The minimal management UI is in scope.** Without an operator surface to
  create and edit personas, per-org personas are data nobody can edit. A minimal
  Settings → Personas surface ships with this slice.

## Architecture

Layering follows the existing convention: `src/domain/` (pure) →
`src/lib/<feature>/` (I/O) → `src/app/<route>/` (views + actions).

### 1. Schema (`supabase/v2/migrations/20260612160000_v2_baseline.sql`)

Edited at the source because the baseline is not yet applied.

- **Remove** `create type public.persona_mapping as enum (...)`.
- Change every `persona` column to **`text`** across: `companies`, `contacts`,
  `properties`, `leads`, `jobs`, `outcomes`, `campaigns`, `persona_snapshots`,
  `persona_knowledge_entries`, and `persona_definitions.key`.
- Keep `'unassigned_persona'` as a plain string sentinel default where columns
  currently default to it.
- Keep `leads_persona_not_unassigned_check` — a text comparison, unchanged in
  behavior.
- **Remove** the hardcoded `audience_type` CHECK constraint
  (`homeowner/property/insurance/real_estate/trade_partner`). `audience_type`
  becomes free text so each org defines its own groupings.
- Keep `persona_definitions (org_id, key)` unique — the per-org source of truth.
- BSR's twelve personas remain as **seed rows**, not as schema. The seed insert
  stays, now writing text keys.

### 2. Domain (`src/domain/personas.ts`)

The *lead-ingestion validation path* becomes org-aware by injecting the allowed
set, while the existing hardcoded set is retained as the **BSR default/seed**
list so the product still has a sane default and the broad set of existing
consumers keeps compiling.

- `validateLeadIngestionPersona(persona, allowedKeys?)` — validates against the
  injected `allowedKeys`. Same result shape and error codes (`persona_required`,
  `persona_internal_only`, `persona_invalid_type`, `persona_unknown`). When
  `allowedKeys` is omitted it falls back to `OFFICIAL_PERSONA_MAPPINGS`, so any
  caller that has not been updated keeps its current behavior.
- `isAllowedPersona(persona, allowedKeys)` — new injected-set membership helper.
- `INTERNAL_UNASSIGNED_PERSONA` and the internal-only rule stay as domain
  constants — that rule is product-wide, not per-org.
- `OFFICIAL_PERSONA_MAPPINGS` is **kept** but its doc comment is changed to arc
  it as the BSR default/seed taxonomy, not the global validation authority.
  Existing helpers (`isOfficialPersonaMapping`, `isAllowedForLeadIngestion`)
  remain for the consumers that still use the default set.

Domain stays pure and unit-tested; the *ingestion* allowed set is injected.

**Deliberately not cascaded this slice.** `OFFICIAL_PERSONA_MAPPINGS` is consumed
by ~20 files (CRM record-form dropdowns, the arc promote dialog, the campaign
create form, mention search, vault links, and as the `z.enum()` source for the
Arc contracts, `competitor-intel`, and the CRM domain record schemas in
`companies/contacts/jobs/outcomes/properties`). Migrating those surfaces to read
per-org personas is later-slice work, scoped to each surface as it is
productized. This slice changes only the ingestion validation source.

### 3. Read-model (`src/lib/personas/`)

New feature directory doing the I/O the domain cannot:

- `getOrgPersonaKeys(orgId)` — active persona keys for an org, used by ingestion
  and validation.
- `listOrgPersonas(orgId)` — full persona rows (label, audience grouping, sort
  order, active flag) for the management UI and read surfaces.
- CRUD persistence for create / edit / activate-deactivate, each gated by
  `requireOperator()` + `isSupabaseAdminConfigured()` and scoped through
  `getCurrentOrgId()`, with `revalidatePath`.

### 4. Lead-ingestion contract (`POST /api/v1/leads/ingest`)

The contract's externally observable shape is preserved. Flow becomes:

1. Resolve the org. For now this uses the existing `getCurrentOrgId()` default
   (the single seeded BSR org). A token → org mapping is a **named seam** that
   belongs to the auth slice, not this one.
2. Load that org's active persona keys via `getOrgPersonaKeys(orgId)`.
3. Validate the submitted persona against *that set* using the refactored
   domain validator.

**Response codes are unchanged and remain load-bearing:** `400`
(validation/persona rejection), `202` (accepted, Supabase not configured — no
row written), `201` (accepted + persisted), `502` (persistence error).

The only behavioral change: the allowed persona set is read from the org's data
instead of a frozen constant. With one seeded org, observable behavior is
identical to today; the difference is that org #2 would get its own set.

### 5. Management UI (`src/app/settings/` → Personas)

Minimal operator surface, wired-feature shape:

- List the current org's personas (label, key, audience grouping, active flag),
  sorted by sort order.
- Add a persona; edit label / audience grouping / sort order; toggle active.
- Server actions gated by `requireOperator()` + `isSupabaseAdminConfigured()`,
  persisting through `src/lib/personas/`, with `revalidatePath`.

Reuses existing `page-header.tsx` primitives and settings layout patterns;
follows `DESIGN.md`.

### 6. Generated types

After the schema edit, regenerate `src/lib/supabase/database.types.ts` so the
former enum union becomes `string` on every `persona` column. Update any code
that imported the enum union type to use the domain types instead.

## Explicitly Out of Scope

Named to prevent scope creep — each is its own later slice:

- Per-org `app_settings` / `connections` / `agent_connections` (currently global
  primary keys) — **slice 2: per-org identity & settings**.
- Per-org agent identity (the "Arc" name, voice, branding) — slice 2.
- Persona-keyed *strategy* (CTA rules, scoring weights) becoming per-org
  configurable — future.
- Real tenant auth / org routing (signed-in user → org; token → org for
  ingestion) — deferred per the V2 baseline.
- Curated persona library / starter sets by vertical — a layer on top of this.
- The vault knowledge layer (seeded persona/brand notes, backlinks, graph) —
  slice 3, which this slice unblocks.

## Testing

- **Domain:** validator tests over injected allowed sets — known-valid, unknown,
  inactive-excluded, `unassigned_persona` rejection, empty/invalid types. No
  hardcoded list.
- **Read-model:** `getOrgPersonaKeys` / `listOrgPersonas` return active,
  org-scoped, sorted rows; CRUD round-trips.
- **Ingestion contract:** the four response codes still hold; persona accepted
  when in the org's set, rejected (400) when not; 202 when Supabase unconfigured.
- **Management actions:** create / edit / activate-deactivate persist and revalidate;
  auth gate enforced.

## Success Criteria

- The `persona_mapping` enum no longer exists; all `persona` columns are text.
- A second organization could be seeded with a completely different persona set
  and the ingestion API would validate against that org's set.
- BSR's twelve personas exist as seed data and behave exactly as before.
- An operator can view and edit their org's personas in Settings.
- Lead-ingestion response codes are unchanged.
- `pnpm test` passes; `pnpm build` typechecks against regenerated types.
