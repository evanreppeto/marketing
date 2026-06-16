# Connections + Resend Email Send — Design Spec

**Date:** 2026-06-09
**Status:** Approved (brainstorming) → implementation
**Scope:** Spec 1 of 2. Spec 2 (social posting via OAuth + Arc) is deferred to its own spec.

## Goal

Give the operator a **Connections** surface to manage outbound integrations, and wire
**Resend** so a real email can actually be sent — but only as an operator-triggered,
approval-gated dispatch. Social providers appear as connectable placeholders with no
transport yet.

## Guiding constraints (from the codebase)

- The app is a **control plane**. The accurate invariant is: *the app never sends
  unapproved content; the only real send is an operator-triggered, approval-gated
  dispatch.* (We update the older "the app never sends anything" doc-comments to this.)
- **Secrets live in env vars**, never in the DB — matching every existing secret
  (`SUPABASE_SERVICE_ROLE_KEY`, `ARC_AGENT_API_TOKEN`). No encryption-at-rest layer
  is built in Spec 1. (Social OAuth tokens in Spec 2 will need encrypted storage —
  designed then.)
- Layering: `src/domain/` (pure) → `src/lib/<feature>/` (I/O) → `src/app/<route>/`.
- Reuse shared UI primitives (`Panel`, `StatusPill`, `OperatorBar`, `ActionFeedback`)
  per `DESIGN.md`. No new layout components, no 3-equal-column rows.

## Send boundary decision

| Channel | Who executes the real call | Rationale |
|---|---|---|
| Resend (email) | **The Next app** (server action → `fetch` to Resend) | One authenticated POST; self-contained, testable, no external worker needed. |
| Social | **Arc** (app only connects + enqueues) | OAuth per platform + token refresh + media + per-platform payloads belong in the executor. Deferred to Spec 2. |

## Data model

### New migration `<ts>_connections.sql`

```sql
create type public.connection_provider as enum ('resend','instagram','facebook','linkedin','x');
create type public.connection_kind as enum ('email','social');

create table public.connections (
  id              uuid primary key default gen_random_uuid(),
  provider        public.connection_provider not null unique,
  kind            public.connection_kind not null,
  label           text not null,
  enabled         boolean not null default false,        -- operator kill-switch
  env_var         text,                                  -- which env var supplies the secret
  config          jsonb not null default '{}'::jsonb,    -- e.g. { fromEmail, fromName }
  last_tested_at  timestamptz,
  last_test_ok    boolean,
  last_test_error text,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

Seeded: one row per provider. Resend `kind=email env_var='RESEND_API_KEY'`; the four
social providers `kind=social`, `enabled=false`, no `env_var`.

**Status is computed, never stored** (read-model):

```
not_configured  -- env_var absent from process.env
disabled        -- env present, enabled = false
error           -- last_test_ok = false
connected       -- env present, enabled, last test ok (or untested)
```

"Disconnect" flips `enabled=false` (kill-switch); it never touches the env var.

### Reused table `outbound_dispatches` (no schema change)

Already has `approval_item_id`, `approval_gate_check` constraint, unique
`idempotency_key`, `provider`, `provider_message_id`, `last_error`, `dispatched_at`,
and `dispatch_status` enum (`queued|dispatched|failed|...`). Built for exactly this.

## Domain — `src/domain/connections.ts` (pure, unit-tested)

- `CONNECTION_REGISTRY` — canonical provider list (provider, kind, label, envVar).
- `computeConnectionStatus({ envPresent, enabled, lastTestOk })` → status.
- `buildResendEmailPayload({ from, to, subject, html, text })` → Resend request body.
- `resolveDispatchIdempotencyKey(parts)` → stable key.

Re-exported via `src/domain/index.ts`.

## lib — `src/lib/connections/`

- `resend-client.ts` — `fetch` wrapper on `https://api.resend.com` (no new dep):
  - `testResendConnection(apiKey)` → `GET /domains` → `{ ok, error? }`.
  - `sendResendEmail(apiKey, payload)` → `POST /emails` → `{ id }` or throws.
- `read-model.ts` — `getConnections()` joins DB rows + `process.env` presence → status list.
- `persistence.ts` — `setConnectionEnabled`, `recordConnectionTest`, `recordConnectionUse`.

## lib — `src/lib/dispatch/execute-resend.ts`

`executeResendDispatch({ dispatchId }, client)`:

1. Load `outbound_dispatches` row. Refuse unless `status='queued'`, `approval_item_id`
   set, and that approval item is `approved`. If already `dispatched`, return existing
   `provider_message_id` (idempotent — no double-send).
2. Require Resend connection `connected`.
3. `sendResendEmail(...)`:
   - success → `status='dispatched'`, `provider='resend'`, `provider_message_id`,
     `dispatched_at`; `recordConnectionUse`; log `dispatch_sent` event.
   - failure → `status='failed'`, `last_error`; log `dispatch_failed`. Never throws past
     the action.

Stands alone against `outbound_dispatches`; the existing `campaign_dispatches`/`launch.ts`
flow is **not** rewritten this round (doc-comment notes the eventual reconciliation).

## Operator actions (`"use server"`, gated by `requireOperator()` + `isSupabaseAdminConfigured()`)

- **Test connection** — `testResendConnection`, records telemetry.
- **Send test email** — to `OPERATOR_EMAIL` (or a typed address); verifies the live key.
- **Enable/Disable** — flips `connections.enabled`.
- **Send via Resend** — on an approved email deliverable: ensure a queued,
  approval-linked `outbound_dispatches` row exists (idempotent), then
  `executeResendDispatch`.

All return `{ ok, message }`; none throw to the UI. `revalidatePath` after writes.

## UI — `src/app/settings/`

- `connections-panel.tsx` (server) — renders `getConnections()`. Each row: label,
  `StatusPill` (connected=green, disabled=slate, error=red, not_configured=amber),
  env-var hint, last-tested / last-used timestamps.
- `connection-controls.tsx` (`"use client"`, `useActionState`) — per row:
  - Resend: Enable/Disable, Test connection, Send test email (address input,
    defaults to `OPERATOR_EMAIL`).
  - Social: `not_configured` + "ships in a later release" note. No fake controls.
- Inline feedback via `ActionFeedback`.
- "Send via Resend" button lives on the approved email deliverable in the campaign
  view (shown only when status `approved` and channel email).

## Error handling

Every action returns `{ ok, message }`. Missing env → `not_configured`; disabled →
blocked with reason; Resend API error → recorded as `failed`/`last_test_error` and
surfaced; approval-gate failure → returns why (not approved / already dispatched).

## Testing (vitest)

- **Domain (pure):** `computeConnectionStatus` truth table; `buildResendEmailPayload`;
  `resolveDispatchIdempotencyKey` stability.
- **lib:** `executeResendDispatch` with a fake Supabase client + mocked `sendResendEmail`
  — refusal on unapproved/non-queued, idempotent no-double-send, success/failure
  transitions + event logging. `read-model` status computation vs env presence.
- No live network in tests; the Resend client is injected/mocked.

## Env

New: `RESEND_API_KEY` (the live key), optional `RESEND_FROM` / `OPERATOR_EMAIL` for the
from-address and test-send default. Add to `.env.example`. Without `RESEND_API_KEY` the
Connections panel shows Resend as `not_configured` and sends are blocked — graceful
degradation like the rest of the app.

## Out of scope (Spec 2)

Social OAuth flows, encrypted token storage, per-platform Arc-executed posting,
reconciliation of `campaign_dispatches` onto `outbound_dispatches`.
