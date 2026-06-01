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

- Product posture: this app is primarily a backend/control plane for the Hermes agent. Build durable APIs, records, queues, approvals, logs, and state transitions first. UI pages are detailed operator views for humans and Hermes debugging, not the main source of product value.
- `src/domain/` — pure, deterministic business logic (Zod schemas, persona validation, loss-keyword classifier, lead/partner scoring). No I/O. Heavily unit-tested in `src/domain/__tests__/`.
- `src/app/api/v1/leads/ingest/route.ts` — the only live API surface. Calls `parseLeadIngestionPayload` from `@/domain`, then `persistLeadIngestion` from `@/lib/lead-ingestion/persistence` only if Supabase env vars are set.
- `src/lib/supabase/server.ts` — admin client, lazily created from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- `src/app/` route folders (`crm`, `data-foundation`, `lead-ingestion`, `loss-routing`, `score-rules`, `reports`, `customer-types`, `ai-studio`) are UI views over the same domain model. `_components/` and `_data/` are colocated, private (underscore-prefixed).
- `src/app/_components/page-header.tsx` is the shared UI primitives module — exports `PageHeader`, `Panel`, `StatusPill`, `OperatorBar`, `ActionFeedback`, `EmptyState`. Reuse these before adding new layout components.
- `src/app/_components/app-shell.tsx` reads `navItems` from `src/app/_data/growth-engine.ts`. Adding a top-level page = add an entry to `navItems`.
- `src/app/crm/_components/{crm-command-header,crm-object-page,crm-record-page}.tsx` are shared across all six CRM subroutes (companies, contacts, properties, leads, jobs, outcomes). `[recordId]` pages are dynamic; list pages are static.
- `supabase/migrations/` — single migration defines the 6-object CRM (companies, contacts, properties, leads, jobs, outcomes) and the `persona_mapping` enum.

## Scaffold-Mode Actions (preview-only UI)

Most pages are async server components that destructure `searchParams.action` and pair two primitives:
- `<OperatorBar primary={<Link href="?action=foo" />} />` — page-level task with action buttons that just set a query param.
- `<ActionFeedback action={action} messages={{ foo: "Preview: ..." }} />` — inline preview banner keyed by the active `action`.

No data is written. This is intentional until persistence is wired. Don't replace these links with form submissions or mutations.

When persistence is wired, approval actions should become real backend state transitions. Use the ContentEngine-style pattern for campaigns and ads: Hermes creates a draft, the item enters approval with prompt inputs/source records/output/risk flags, and the human can approve, decline, request revision, or archive. Approved items unlock the next backend step; declined or blocked items stay unavailable.

## Lead Ingestion Contract (don't break this)

- 12 official personas live in `OFFICIAL_PERSONA_MAPPINGS` (`src/domain/personas.ts`). They must stay in sync with the `persona_mapping` enum in the Supabase migration.
- `unassigned_persona` is **internal-only** — the ingest API rejects it, and the DB enforces it via `leads_persona_not_unassigned_check`.
- Ingest response codes are load-bearing: `400` (validation/persona rejection), `202` (accepted but Supabase not configured — no row written), `201` (accepted + persisted), `502` (persistence error).
- Routing and scoring are intentionally **deterministic and owned by the app layer** (not the DB) so they stay unit-testable. Don't push that logic into Postgres.

## Design System

UI work must follow `DESIGN.md` (Command Charcoal / Canvas White / Restoration Red palette; no emojis, no purple/neon AI aesthetic, no equal 3-column dashboard rows).

## Env

Copy `.env.example` → `.env.local`. Without Supabase vars, the ingest route still validates and scores but returns `202` with `persistence.status: "not_configured"` — useful for local dev.
