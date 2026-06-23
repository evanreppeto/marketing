# Auth Front Door — Correctness & Trust (Design)

**Date:** 2026-06-22
**Status:** Approved (design)
**Program:** Access & Activation — Project 1 of 3 (front door → branded invite email → Arc-led first-run activation)

## Problem

Two concrete defects make the sign-in / invite flow unreliable:

1. **Invite (and any email) links don't confirm.** `POST /api/auth/workspace-invites` sends
   `inviteUserByEmail(..., { redirectTo: "/auth/callback" })`, but `/auth/callback`
   only handles the Google-OAuth case — it reads `?code` and calls
   `exchangeCodeForSession` (`src/app/auth/callback/route.ts`). Supabase email links
   (invite / magic-link / recovery / email-change) carry a `token_hash` + `type` and
   must be verified with `supabase.auth.verifyOtp({ type, token_hash })`. The PKCE
   `exchangeCodeForSession` path **cannot** work for an admin-generated invite because
   the recipient's browser never stored a PKCE code-verifier. Result: a delivered
   invite, when clicked, lands on `/login?error=oauth` instead of signing the user in.
   Confirmed against Supabase's official SSR docs (the `/auth/confirm` + `verifyOtp`
   pattern).

2. **Auth-mode misconfiguration fails silently.** `getAuthMode()`
   (`src/lib/auth/auth-mode.ts`) returns `"open"` whenever a requested mode's
   prerequisites are missing — e.g. `ARC_AUTH_MODE=supabase` but
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` unset. In "open" mode the login page redirects away
   and the sign-in POST sets no session, so a misconfigured deployment looks exactly
   like "sign-in does nothing," with no signal pointing at the cause.

## Goals

- An invited teammate clicks the email link and is signed in + joined to the workspace.
- Google OAuth sign-in keeps working unchanged.
- A misconfigured auth mode is **obvious in seconds**, not a silent downgrade.

## Non-goals

- The branded invite email body (Project 2).
- Arc-led first-run / brand capture (Project 3).
- Any change to how invite codes are issued or redeemed
  (`provisionAuthenticatedUser` is reused untouched).

## Architecture

### A. Two single-purpose auth routes

- **`/auth/callback` (unchanged)** — Google OAuth only: `?code` →
  `exchangeCodeForSession` → `provisionAuthenticatedUser` → existing redirect logic.

- **`/auth/confirm` (new)** — email-link verification:
  1. Read `token_hash` and `type` (`EmailOtpType`) from the query; read safe `next`.
  2. If either is missing → redirect `/login?error=link&from=<next>`.
  3. `const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })`.
     On `error` → `/login?error=link&from=<next>`.
  4. On success reuse the **identical** post-auth routing the callback already
     implements: `provisionAuthenticatedUser(data.user)` →
     - `!ok` → `/login?error=provision&from=<next>`
     - `invited_member` → `/welcome?from=<next>`
     - `profile_only` → `/onboarding?from=<next>`
     - else → `<next>`

  To avoid duplication, extract the shared post-verify routing into a helper
  (`resolveAuthedRedirect(user, next, origin)` in `src/lib/auth/post-auth-redirect.ts`)
  and call it from both routes.

- **Invite route** (`src/app/api/auth/workspace-invites/route.ts`): change
  `redirectTo` from `/auth/callback` to `/auth/confirm`.

- **Supabase email template (operator step, documented):** change the **Invite user**
  template link from `{{ .ConfirmationURL }}` to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`. Without this the
  default link still points at Supabase's `/verify` endpoint (the broken path), so the
  template change is required for delivery — and Project 2 restyles this same template.

### B. Fail-loud auth mode + diagnostics

- In `getAuthMode()`, when a mode is *requested* (`ARC_AUTH_MODE`/`AUTH_MODE` set to a
  valid value) but its prerequisites are unmet, emit a single clear
  `console.warn` (e.g. `[auth] ARC_AUTH_MODE=supabase requested but Supabase URL/anon
  key missing — falling back to open`). Still return `"open"` (no behavior change beyond
  the log) to avoid hard-failing a running deployment.
- Add a read-only **`GET /api/auth/status`** returning
  `{ requested, resolved, supabaseConfigured, operatorConfigured }` (booleans/strings
  only — no secrets). Lets us confirm the live deployment's mode post-deploy without
  dashboard digging. Not gated (it leaks no secrets), but returns only enum/boolean
  fields.

### C. Operator config checklist (runbook)

Extend `docs/runbooks/email-invites-setup.md` with a "Front-door checklist":
- Vercel: `ARC_AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` all set.
- Supabase → Auth → URL Configuration: Site URL = prod domain; Redirect URLs include
  both `/auth/callback` and `/auth/confirm`.
- Supabase → Auth → Email Templates → Invite user: link uses the `/auth/confirm?token_hash=…&type=invite` form.
- Verify live via `GET /api/auth/status` → `resolved: "supabase"`.

## Testing

- **`/auth/confirm` route:** valid `token_hash`+`type` → `verifyOtp` called, provision
  runs, redirects per status (invited→/welcome, profile_only→/onboarding,
  member→next); `verifyOtp` error → `/login?error=link`; missing params →
  `/login?error=link`. (Mock `createSupabaseAuthServerClient` + `provisionAuthenticatedUser`,
  mirroring the existing `callback/route.test.ts`.)
- **Shared helper:** unit-test `resolveAuthedRedirect` mappings directly.
- **`getAuthMode`:** requested-but-unconfigured → returns `"open"` **and** warns
  (spy on `console.warn`); fully-configured supabase → `"supabase"` with no warn.
- **`/api/auth/status`:** returns resolved/requested without throwing when unconfigured.
- **Invite route:** asserts `redirectTo` endpoint is `/auth/confirm`.
- Full `pnpm test` + `npx tsc --noEmit`.

## Safety & scope

- Additive: new route + new helper + a log line + a status route + an env-driven
  `redirectTo` string change. Google OAuth path untouched. Invite issuance/redemption
  untouched. No schema change, no migration.
- The email-template change is operator config (documented), not code, and is shared
  with Project 2.
