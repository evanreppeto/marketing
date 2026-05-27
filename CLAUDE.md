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

- `src/domain/` — pure, deterministic business logic (Zod schemas, persona validation, loss-keyword classifier, lead/partner scoring). No I/O. Heavily unit-tested in `src/domain/__tests__/`.
- `src/app/api/v1/leads/ingest/route.ts` — the only live API surface. Calls `parseLeadIngestionPayload` from `@/domain`, then `persistLeadIngestion` from `@/lib/lead-ingestion/persistence` only if Supabase env vars are set.
- `src/lib/supabase/server.ts` — admin client, lazily created from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- `src/app/` route folders (`crm`, `data-foundation`, `lead-ingestion`, `loss-routing`, `score-rules`, `reports`, `customer-types`) are UI views over the same domain model. `_components/` and `_data/` are colocated, private (underscore-prefixed).
- `supabase/migrations/` — single migration defines the 6-object CRM (companies, contacts, properties, leads, jobs, outcomes) and the `persona_mapping` enum.

## Lead Ingestion Contract (don't break this)

- 12 official personas live in `OFFICIAL_PERSONA_MAPPINGS` (`src/domain/personas.ts`). They must stay in sync with the `persona_mapping` enum in the Supabase migration.
- `unassigned_persona` is **internal-only** — the ingest API rejects it, and the DB enforces it via `leads_persona_not_unassigned_check`.
- Ingest response codes are load-bearing: `400` (validation/persona rejection), `202` (accepted but Supabase not configured — no row written), `201` (accepted + persisted), `502` (persistence error).
- Routing and scoring are intentionally **deterministic and owned by the app layer** (not the DB) so they stay unit-testable. Don't push that logic into Postgres.

## Design System

UI work must follow `DESIGN.md` (Command Charcoal / Canvas White / Restoration Red palette; no emojis, no purple/neon AI aesthetic, no equal 3-column dashboard rows).

## Env

Copy `.env.example` → `.env.local`. Without Supabase vars, the ingest route still validates and scores but returns `202` with `persistence.status: "not_configured"` — useful for local dev.
