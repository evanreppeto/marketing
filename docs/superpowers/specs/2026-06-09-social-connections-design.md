# Social Connections — Credentials, Status & Operator Controls — Design Spec

**Date:** 2026-06-09
**Status:** Approved (brainstorming) → implementation
**Scope:** The first half of "Spec 2" from the Connections+Resend spec. Wires social
**credentials, status, and operator controls**. OAuth authorization flows and real posting
transport (`execute-social`, `social_accounts`/`social_posts` wiring) are deferred to a
**transport spec**.

## Goal

Give each social provider (Instagram, Facebook, LinkedIn, X) its real Vercel env vars, plumb
operator-facing status off env-var presence, and surface the **same live operator controls
Resend has** (enable/disable + test) — while real posting stays stubbed. Today the four social
providers are seeded in `connections` with `env_var = null` and rendered as inert chips; this
spec makes them first-class, configurable rows.

## Guiding constraints (from the codebase)

- The app is a **control plane**. The only real outbound is an operator-triggered,
  approval-gated dispatch. Nothing in this spec sends anything.
- **Secrets live in env vars (Vercel), never in the DB, never on the Mark runtime.** Matches
  every existing secret. See "Secret ownership" below.
- Layering: `src/domain/` (pure) → `src/lib/<feature>/` (I/O) → `src/app/<route>/`.
- Reuse shared UI primitives (`Panel`, `StatusPill`, `Button`) per `DESIGN.md`. No new layout
  components, no 3-equal-column rows, no emojis.
- Follow the **Resend pattern exactly** — this spec adds a parallel, lighter row type, not a
  new mechanism.

## Secret ownership (decided)

Social secrets are **control-plane-only**. Mark/Hermes holds just `HERMES_AGENT_API_TOKEN`
and *proposes* posts (draft → approval) + triggers an **approved** dispatch via API; the app
executes the real call with the credentials. This preserves the approval gate ("no page
publishing without explicit human approval"), one revocation point, one audit trail, and a
smaller secret footprint on the Mark host. This refines the earlier Connections+Resend note
("Social → Hermes executes"): regardless of *where* the final HTTP call ultimately runs, the
**secrets are never shipped to Mark** — they stay in this app's env.

## Credentials (the Vercel env vars)

Documented in full, with acquisition steps, in [`docs/social-connections-setup.md`](../../social-connections-setup.md).

```bash
# Meta — ONE app powers both Facebook Page + Instagram Business publishing.
META_APP_ID=
META_APP_SECRET=
META_PAGE_ID=               # gates Facebook
META_PAGE_ACCESS_TOKEN=     # gates Facebook + Instagram
META_IG_USER_ID=            # gates Instagram
# LinkedIn
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_ORG_URN=
# X (Twitter) — OAuth 1.0a user context
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

**Provider → required env vars** (all must be present for status = configured):

| Provider | Required env vars |
|---|---|
| `facebook` | `META_APP_ID`, `META_APP_SECRET`, `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN` |
| `instagram` | `META_APP_ID`, `META_APP_SECRET`, `META_IG_USER_ID`, `META_PAGE_ACCESS_TOKEN` |
| `linkedin` | `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_URN` |
| `x` | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` |

Facebook and Instagram remain **two separate toggle rows** (operator can disable one without
the other) that share the Meta credential block.

## Changes by layer

### `src/domain/connections.ts` (pure)
- Add `requiredEnvVars: string[]` to `ConnectionRegistryEntry`. Resend → `["RESEND_API_KEY"]`;
  social → the sets above.
- Keep `envVar: string | null` as the **primary/display** var (Resend `RESEND_API_KEY`; social
  set to a representative primary, e.g. `META_PAGE_ACCESS_TOKEN`, `LINKEDIN_ACCESS_TOKEN`,
  `X_API_KEY`) so the existing single-var display still renders meaningfully.
- `computeConnectionStatus` is unchanged — it already takes `envPresent: boolean`.

### `src/lib/connections/read-model.ts` (I/O)
- `envPresent` is computed from the **registry entry's `requiredEnvVars`** (looked up by
  provider), not the row's single `env_var` column: present iff *every* required var is set.
- `fallbackViews()` already maps the registry — update it to use the same all-required check.
- `ConnectionView` gains `requiredEnvVars: string[]` so the controls can list var names.

### `supabase/migrations/<ts>_social_connection_env.sql` (new — do not edit shipped migration)
- `UPDATE public.connections SET env_var = '<primary>' WHERE provider IN (...)` for the four
  social rows, so the display column is non-null. No structural change; presence logic lives in
  the registry/read-model. Social rows stay `enabled = false` (operator opts in).

### `src/app/settings/connections-actions.ts` (server actions)
- Replace the Resend-only `isResend` guard with a provider-kind check:
  - `setConnectionEnabledAction` — allow **any** registered provider (email + social).
  - `testConnectionAction` — for `kind = social`, "test" = **env-presence check** of
    `requiredEnvVars` (records `last_test_ok` + a clear `last_test_error` listing any missing
    vars). **No live API call.** Resend keeps its live probe.
  - `sendTestEmailAction` / `sendDispatchAction` — remain Resend/email-only.

### `src/app/settings/connection-controls.tsx` (client)
- Add `SocialConnectionControls` (sibling to `ResendConnectionControls`): status pill +
  enable/disable + "Test connection" + the **required env-var names** (names only, never
  values) + last-tested/last-used telemetry. No "send test email", no dispatch.

### `src/app/settings/connections-panel.tsx`
- Render the social group through `SocialConnectionControls` instead of the inert chip list.
  Drop the "coming in a later release" copy; keep a one-line note that posting transport ships
  in the transport spec.

### `.env.example`
- Append the social block above under the existing "Connections" section, mirroring the
  current Resend documentation style, with a pointer to `docs/social-connections-setup.md`.

## Explicitly NOT in this pass (transport spec)
- OAuth authorization flows / token refresh.
- Real posting transport: `src/lib/dispatch/execute-social.ts` (mirroring `execute-resend`),
  per-platform payload builders, media handling.
- Wiring `social_accounts` / `social_posts` (migration `20260529120000`) into the flow.
- Any live "test" that calls a social API. Until transport exists, "test" is presence-only so
  the UI never implies we can post when we can't.

## Testing (TDD)
- `src/domain/__tests__/connections.test.ts`: `requiredEnvVars` per provider; multi-var
  presence (all-present vs. one-missing); social status transitions
  (`not_configured`/`disabled`/`error`/`connected`).
- `src/lib/connections/read-model.test.ts`: `envPresent` true only when *all* required vars
  set; `requiredEnvVars` surfaced on the view; Supabase-unconfigured fallback parity.

## Acceptance
- With the social env vars set in Vercel and a redeploy, each social provider shows
  **Not configured → Connected** without code changes.
- Operator can enable/disable each social provider and run a presence "test" that records
  telemetry, exactly like Resend (minus send).
- No secret is ever rendered, persisted, or sent to Mark.
- `pnpm test` and `pnpm lint` pass.
