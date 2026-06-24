# Arc CRM Lead Research — Design

**Date:** 2026-06-24
**Status:** Approved (design); pending implementation plan
**Repo:** `marketing` (Arc / Big Shoulders Growth Engine)

## Problem

Today Arc cannot create or edit core CRM records. It is read-only plus
append-only annotations (`log_interaction` → notes / tasks / activity on
*existing* records). Records enter the CRM through only two paths:

1. `POST /api/v1/leads/ingest` — an intentionally minimal contract built for
   restoration **loss leads**. Its persistence (`src/lib/lead-ingestion/persistence.ts`)
   never writes `contacts.title` or `companies.website_url/email/phone`, so those
   columns are born blank.
2. The human CRM UI forms (`src/app/crm/actions.ts`).

So "tell Arc to find leads and have him fill out proper titles, names, emails,
phones" is a **net-new capability**, not a bug fix. The fields the user named
(title, name, email, phone, website) live on **companies + contacts**, not on the
`leads` table (which has no such columns).

## Goals

- Give Arc a **live** CRM write capability that can both **create** new prospect
  records from web research and **enrich** (backfill blank fields on) existing ones.
- On "find a lead," create **company + contact(s)** with full fields **and** a
  **Leads-pipeline row** pointing at them (persona assigned, `source='arc_research'`).
- Source field data from Arc's existing `research_web` tool only — **no third-party
  data provider (no Apollo)**. Field quality is best-effort; unknown fields stay
  blank and are never fabricated.
- Everything Arc writes is **tagged and auditable** (`source='arc_research'`,
  evidence URLs + confidence in `metadata`, a `crm_activities` timeline entry).

## Non-goals / explicit decisions

- **No per-record approval queue.** Creating/enriching an internal CRM record is
  not an outbound action. Arc writes records live. The human approval gate stays
  exactly where it is today — the campaign / outbound stage. This is consistent
  with the "no outbound without approval" principle; we are not weakening it.
- **No third-party enrichment provider.** No Apollo, Clearbit, or similar.
- **No schema migration for the named fields.** Every field already exists as a
  column: `companies.website_url / phone / email`, `contacts.title / first_name /
  last_name / email / phone`. They are blank today only because the persistence
  layer drops them. This is a purely app-layer change.
- **Scoring is out of scope.** The existing deterministic scoring engine is
  loss-signal based and does not fit research-discovered partner leads. Research
  leads get `lead_score = 0` and a triage status; a future iteration can add a
  research-specific score.

## Architecture

Layering follows the repo convention: `src/domain/` (pure) → `src/lib/<feature>/`
(I/O) → `src/app/api/...` (route) → `apps/arc-runner/src/tools/` (agent tool).

### 1. Arc tool — `apps/arc-runner/src/tools/crm-write.ts`

A new `createLeadFromResearchTool(client, step)` exporting one tool,
`create_lead_from_research`, wired into `writeTools()` in
`apps/arc-runner/src/tools/index.ts` (alongside `interactionWriteTools`). This
inherits the existing **act / draft** mode gating and the `mcp__arc__` namespace
automatically (via `toolsForMode` / `allowedToolNames`).

Zod input schema:

```
persona            z.string()   // required; one of the org's personas (the 12 OFFICIAL_PERSONA_MAPPINGS by default).
                                 // Kept as a described string, NOT a hard z.enum, so the per-org taxonomy
                                 // (persona_definitions) stays the validation authority in the domain layer.
company:           { name (required), website_url?, phone?, email? }
contacts:          [{ first_name?, last_name?, title?, email?, phone? }]  // ≥1; each needs name|email|phone
property?:         { street_line_1, street_line_2?, city, state, postal_code, property_type? }
evidence:          [{ url, note }]                      // required — the sources Arc actually read
confidence?:       number 0..1
existing_company_id?:  string  // explicit enrich target
existing_contact_id?:  string  // explicit enrich target
```

The tool POSTs to `/api/v1/arc/crm/leads` via `client.apiPost`, mirroring how
`log_interaction` posts to `/api/v1/arc/crm/interactions`. It adds
`author_name: "Arc"`.

### 2. API route — `POST /api/v1/arc/crm/leads`

`src/app/api/v1/arc/crm/leads/route.ts`. Mirrors the interactions route exactly:

```
const allowed = await arcGuard(request);
if (!allowed.ok) return allowed.response;
const scope = { orgId: allowed.scope.orgId, workspaceId: allowed.scope.workspaceId };
const body = await readJson(request);            // INVALID_JSON guard
const parsed = parseLeadResearchInput(body);     // domain validation
if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
const result = await persistLeadResearch(parsed.value, scope);   // upsert + lead + activity
if (!result.ok) return fail("failed", result.error, 502);
return ok({ companyId, contactIds, leadId, enriched }, 201);
```

House `{ ok, status, ... }` response style; `400` validation / `502` persistence,
matching ingest's load-bearing codes.

### 3. Domain validation — `src/domain/lead-research.ts` (pure, unit-tested)

- Validate persona with `validateLeadIngestionPersona(persona, orgAllowedKeys)`
  — rejects empty, `unassigned_persona`, and unknown keys. Org allowed keys come
  from the per-org taxonomy where available, falling back to
  `OFFICIAL_PERSONA_MAPPINGS`.
- Each contact must carry at least `first_name | last_name | email | phone`
  (matches the `contacts` table check constraint).
- Email format validated; phone normalized; **invalid or missing values are
  coerced to `null`, never invented.**
- `company.name` required, non-empty. Property (if present) requires
  `street_line_1 / city / state (2 chars) / postal_code`.
- Re-export through `src/domain/index.ts`.

### 4. Persistence + dedup/upsert — `src/lib/lead-research/persistence.ts`

This is where "create new" and "enrich existing" unify as a single **upsert**.

- **Company match:** `existing_company_id` if given; else by `(org_id, lower(name))`
  or matching website domain → reuse; else insert. Insert/enrich writes
  `name, persona, website_url, phone, email, metadata { source: 'arc_research',
  evidence, confidence }, org_id`.
- **Contact match:** `existing_contact_id` if given; else by `(org_id, email)` or
  `(org_id, phone)` → reuse; else insert. Writes `company_id, persona, first_name,
  last_name, title, email, phone, metadata { source: 'arc_research', evidence }`.
- **Enrich rule (critical):** on a matched record, **only fill columns that are
  currently `null`.** Never overwrite an existing non-null value (especially
  human-entered data) with a research guess.
- **Property:** optional; insert linked to company/contact (no dedup in v1).
- **Lead:** always insert — `company_id, contact_id, property_id, persona,
  source: 'arc_research', loss_signals: [], lead_score: 0,
  status: 'needs_review', routing_recommendation: 'target',
  metadata { evidence, confidence }, org_id`. (`needs_review` = live in the Leads
  list, flagged for human triage — not an approval gate.)
- **Audit:** write a `crm_activities` row per created/enriched entity by reusing
  the existing `insertActivity` (`src/lib/interactions/persistence.ts`).
  `activity_type` must be a value in the `CRM_ACTIVITY_TYPES` enum — use
  `record_created` for new records and `record_updated` for enrichment; carry
  `source: 'arc_research'` + evidence in `metadata`. `actor_kind='agent'`,
  `actor_name='Arc'`.
- Reuse the `insertAndReturnId` helper pattern from the ingest persistence; all
  inserts carry `org_id` for tenancy.

Returns `{ ok: true, companyId, contactIds, leadId, enriched: boolean }` or
`{ ok: false, error }`.

### 5. Arc prompt — `apps/arc-runner/src/prompt.ts`

Add a "finding leads" instruction block:

- When asked to find leads/partners, **research first** with `research_web`.
- Extract fields **only from real sources**; pass them via `create_lead_from_research`.
- **Never fabricate** an email or phone — leave unknown fields blank.
- Always pass `evidence` (the URLs read) and a `confidence`.
- Assign the best-fit `persona` from the 12-persona taxonomy.

## Data flow

```
operator (act/draft): "find plumbing partners near Evanston"
  → Arc: research_web → reads real pages
  → Arc: create_lead_from_research { persona, company, contacts[], evidence[] }
     → POST /api/v1/arc/crm/leads  (arcGuard → scope)
        → parseLeadResearchInput            (domain)
        → persistLeadResearch               (upsert company/contact, insert lead, activity)
     → 201 { companyId, contactIds, leadId, enriched }
  → Arc cites sources, emits a card / summary
```

## Error handling

- Malformed JSON → `400 invalid_request`.
- Validation failure (persona, contact min-fields, email format) → `400 invalid_request`
  with a specific message.
- Persistence failure → `502 failed`. Inserts run company → contact(s) → lead in
  sequence; a mid-sequence failure returns `502` and does not retry. (Full
  transactional rollback is a possible v2 hardening; v1 accepts best-effort
  ordering as ingest does today.)
- Supabase not configured → `503 not_configured` (via `arcGuard` / `supabaseGuard`).

## Testing

- `src/domain/__tests__/lead-research.test.ts` — persona validation, contact
  min-field rule, email/phone normalization, fabrication-to-null, property checks.
- `src/lib/lead-research/__tests__/persistence.test.ts` (or repo's lib test
  convention) — insert path, dedup-match path, blank-only enrichment (no overwrite),
  lead row + activity creation.
- `apps/arc-runner/src/tools/crm-write.test.ts` — tool posts the right payload and
  surfaces the response; registered only in act/draft modes (extend
  `tools/index.test.ts`).

## Open / overridable defaults

- **Lead status default = `needs_review`.** Could be `new` instead — trivial to
  change in persistence.
- **Implementation isolation:** the current `codex/premium-crm-product-ui` branch
  has a large uncommitted working tree. Implementation should happen in an isolated
  worktree/branch to avoid entangling with that work.
