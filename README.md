# Big Shoulders Growth Engine

Standalone Next.js + Supabase app for the Big Shoulders Restoration marketing and growth engine.

## Current MVP

This first slice builds the data foundation:

- Six core CRM objects: companies, contacts, properties, leads, jobs, and outcomes
- Official 12-persona mapping from the persona knowledge base
- Internal-only `unassigned_persona` fallback, rejected by new lead ingestion
- Flood and water-loss routing rules
- Deterministic lead and partner scoring
- Zod-backed lead ingestion API at `POST /api/v1/leads/ingest`

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

To require sign-in for the human-facing app, set `OPERATOR_ACCESS_TOKEN`, `OPERATOR_EMAIL`, and `OPERATOR_PASSWORD` in `.env.local`.
The app redirects page routes to `/login`, then creates a cookie session after the email and password match.
Set `OPERATOR_SUPPORT_EMAIL` if the forgot-password screen should send reset requests somewhere other than the operator email.
API routes keep using their separate bearer tokens.

## Verification

```bash
pnpm test
pnpm lint
pnpm build
```

## Supabase

The initial schema lives in `supabase/migrations`.

Copy `.env.example` to `.env.local` and fill in the Supabase values before enabling database writes. The current ingestion route validates, classifies, and scores payloads, but intentionally does not persist records until Supabase project environment variables are connected.
