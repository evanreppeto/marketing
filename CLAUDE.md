@AGENTS.md

# Big Shoulders Growth Engine

Next.js 16 + React 19 + Supabase app. Package manager is **pnpm** (workspace declared in `pnpm-workspace.yaml`). Path alias `@/*` → `./src/*`.

## Commands

```bash
pnpm dev            # next dev
pnpm build          # next build
pnpm test           # vitest run (one-shot; no watch by default)
pnpm test path/to/file.test.ts   # run a single test file
pnpm lint           # eslint (flat config in eslint.config.mjs)
```

## Architecture

- Product posture: this app is primarily a backend/control plane for the **Hermes** agent (surfaced in the UI as **Mark**). Build durable APIs, records, queues, approvals, logs, and state transitions first. UI pages are detailed operator views for humans and agent debugging, not the main source of product value.
- Layering convention: `src/domain/` (pure logic) → `src/lib/<feature>/` (I/O, persistence, read-models, repos) → `src/app/<route>/` (server-component views + colocated `_components/`/`_data/`). Don't put I/O in `domain/`; don't put business rules in `app/`.
- `src/domain/` — pure, deterministic business logic. No I/O. Heavily unit-tested in `src/domain/__tests__/`. Modules: `personas`, `scoring`, `lead-ingestion`, `leads`, `loss-classification`, `routing-decisions`, `events`, `integrity-findings`, `notebook`, `campaign-revisions`. Everything re-exports through `src/domain/index.ts` — import from `@/domain`.
- Live API surfaces (each carries its own auth — see Operator Auth & API Tokens):
  - `POST /api/v1/leads/ingest` — calls `parseLeadIngestionPayload` from `@/domain`, then `persistLeadIngestion` from `@/lib/lead-ingestion/persistence` only if Supabase env vars are set.
  - `POST /api/v1/hermes/runs` — bearer-gated (`HERMES_AGENT_API_TOKEN`); runs `runHermesPartnerCampaign` from `@/lib/hermes/orchestrator`. Returns `503 not_configured` if Supabase admin isn't set up. `POST /api/v1/hermes/ping` is the bearer-gated health/connectivity check.
  - `POST /api/v1/approvals` and `POST /api/v1/approvals/history` — programmatic approval surface (bearer-gated like the other `/api/v1` routes).
  - `/api/auth/sign-in`, `/api/auth/sign-in/passkey`, `/api/auth/sign-out` — operator session cookie management.
- `src/lib/supabase/server.ts` — admin client, lazily created from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Guard every persistence call with `isSupabaseAdminConfigured()`; without env vars the app degrades gracefully instead of throwing.
- `src/lib/repos/` — thin repository layer over Supabase (currently `leads`). Use/extend this for new typed table access rather than hand-rolling queries in routes.
- `src/app/_components/page-header.tsx` is the shared UI primitives module — exports `PageHeader`, `Panel`, `StatusPill`, `OperatorBar`, `ActionFeedback`, `EmptyState`. Reuse these before adding new layout components.
- `src/app/_components/app-shell.tsx` reads `navItems` from `src/app/_data/growth-engine.ts` (current top-level nav: Today `/`, Activity `/approvals`, CRM `/crm`, Personas `/persona-intelligence`, Mark `/agent-operations`, Settings `/settings`). Adding a top-level page = add an entry to `navItems`. Note: the wired Campaigns feature lives at `/campaigns` but is **not** yet in `navItems`.
- `src/app/crm/_components/{crm-command-header,crm-object-page,crm-record-page}.tsx` are shared across all six CRM subroutes (companies, contacts, properties, leads, jobs, outcomes). `[recordId]` pages are dynamic; list pages are static.
- `supabase/migrations/` — ordered, timestamp-prefixed migrations applied in sequence (initial 6-object CRM + `persona_mapping` enum, then phase-1 activity/routing/integrity, hyper-personalization, agent-operations scaffold, Hermes backend foundation, data-API role grants, vault notes, approval-decision `reverted` state). Add a new timestamped file; don't edit shipped ones.

## Operator Auth & API Tokens

Two independent auth mechanisms — don't conflate them:

- **Operator gate (human UI).** Opt-in via `OPERATOR_ACCESS_TOKEN`: when unset (local dev) everything is open; when set, page routes require a `signal_operator` cookie. Enforced at the edge by `src/proxy.ts` — this is **Next.js 16's renamed middleware** (`middleware` → `proxy`), not a custom file. Its `config.matcher` skips API routes, Next internals, the auth pages, and brand assets. Because `proxy.ts` runs on the edge it can only import `src/lib/auth/operator-shared.ts` (no `next/headers`); the cookie/redirect helpers live there. Server actions and mutating server components call `requireOperator()` from `src/lib/auth/operator.ts` for defense-in-depth.
- **API bearer tokens (programmatic callers).** API routes are *not* covered by the operator gate. They validate their own bearer tokens via `checkBearerToken(request, "ENV_VAR")` in `src/lib/auth/api-token.ts` (e.g. `HERMES_AGENT_API_TOKEN`).

## Wired Persistence vs. Scaffold-Mode

Two features are now fully wired and serve as reference implementations of the same shape — real `"use server"` actions gated by `requireOperator()` + `isSupabaseAdminConfigured()`, persisting through a `src/lib/<feature>/` layer + `revalidatePath`:

- **Vault notebook** (`src/app/vault/`, `src/lib/vault/`, `src/domain/notebook.ts`) — actions in `vault/actions.ts`, persistence in `src/lib/vault/persistence.ts`. Models the Obsidian-style vault (frontmatter parsing, backlinks, collections, live Mark/record signals).
- **Campaigns** (`src/app/campaigns/`, `src/lib/campaigns/`, `src/domain/campaign-revisions.ts`) — actions in `campaigns/actions.ts`; persistence split across `src/lib/campaigns/{read-model,decisions,revisions}.ts`. This is the ContentEngine-style approval flow in practice: Mark drafts assets, the operator approves / declines / archives or requests a revision, and outbound stays locked until approved.

Follow this shape when wiring other features. The remaining `src/lib/<feature>/` dirs (e.g. `activity`, `approvals`, `partners`, `performance`, `persona-intelligence`, `loss-routing`, `agent-operations`) are mostly read-models feeding still-scaffold pages.

**Other pages are still scaffold-mode (preview-only).** Most are async server components that destructure `searchParams.action` and pair two primitives:
- `<OperatorBar primary={<Link href="?action=foo" />} />` — page-level task with action buttons that just set a query param.
- `<ActionFeedback action={action} messages={{ foo: "Preview: ..." }} />` — inline preview banner keyed by the active `action`.

These write no data, intentionally, until each feature is wired. Don't convert scaffold links to mutations casually — wire the persistence layer + auth gate (as the vault does) first.

When wiring approval actions, make them real backend state transitions. Use the ContentEngine-style pattern for campaigns and ads: Hermes/Mark creates a draft, the item enters approval with prompt inputs/source records/output/risk flags, and the human can approve, decline, request revision, or archive. Approved items unlock the next backend step; declined or blocked items stay unavailable.

## Lead Ingestion Contract (don't break this)

- 12 official personas live in `OFFICIAL_PERSONA_MAPPINGS` (`src/domain/personas.ts`). They must stay in sync with the `persona_mapping` enum in the Supabase migration.
- `unassigned_persona` is **internal-only** — the ingest API rejects it, and the DB enforces it via `leads_persona_not_unassigned_check`.
- Ingest response codes are load-bearing: `400` (validation/persona rejection), `202` (accepted but Supabase not configured — no row written), `201` (accepted + persisted), `502` (persistence error).
- Routing and scoring are intentionally **deterministic and owned by the app layer** (not the DB) so they stay unit-testable. Don't push that logic into Postgres.

## Design System

UI work must follow `DESIGN.md` (Command Charcoal / Canvas White / Restoration Red palette; no emojis, no purple/neon AI aesthetic, no equal 3-column dashboard rows).

## Env

Copy `.env.example` → `.env.local`. Without Supabase vars, the ingest route still validates and scores but returns `202` with `persistence.status: "not_configured"` — useful for local dev.

Key vars: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (persistence); `OPERATOR_ACCESS_TOKEN` / `OPERATOR_EMAIL` / `OPERATOR_PASSWORD` (operator UI gate — leave unset locally to stay open); `HERMES_AGENT_API_TOKEN` (bearer for `POST /api/v1/hermes/runs`). `pnpm seed:hermes-demo` seeds demo data; `pnpm seed:test-campaign` seeds a campaign for the wired campaigns flow.
