# Branded Transactional Email — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming → ready for implementation plan)

## Goal

Now that we have a verified-able sending domain and a Resend account, wire transactional/auth email so it (a) delivers reliably and (b) is branded — with one repo-owned template layer. Two outcomes in scope:

1. **Auth emails reliable + branded** — sign-in / invite / recovery / signup-confirm emails deliver through Resend instead of Supabase's rate-limited built-in sender, and look branded.
2. **Branded transactional templates in-app** — a reusable, tested email-template layer in the repo (brand shell: logo, colors, header/footer, CTA) used for the emails the app sends itself.

**Out of scope (now):** campaign/marketing sends (`ENABLE_CAMPAIGN_SEND` stays off); the Send Email Hook (Phase 2, noted below).

## Approach (chosen: Hybrid "C")

Deliver reliable + branded invites entirely repo-owned now, brand the remaining Supabase-sent auth emails pragmatically via exported HTML, and leave a clean upgrade path to full unification (the hook) — without the all-or-nothing risk of intercepting *every* auth email on day one.

### Why not the alternatives
- **A — Hosted templates only:** two sources of truth (dashboard HTML vs. repo), no per-org branding, Go vars instead of components. Drifts.
- **B — Send Email Hook (full unification):** one endpoint handles all 6 auth email types and a hook failure blocks auth mail; too much surface for day one. Kept as Phase 2.

## Key facts established during design

- **Invites today are Supabase-Auth emails.** `src/app/api/auth/workspace-invites/route.ts:37` calls `auth.admin.inviteUserByEmail`, so Supabase renders + sends them. To brand them in-app we must stop Supabase from sending and render/send ourselves.
- **App-driven Resend sends already exist** but send raw `payload.html` with no shared brand shell: `src/lib/dispatch/execute-resend.ts` → `src/lib/connections/resend-client.ts` (`sendResendEmail`). `RESEND_FROM` resolution and the "Resend connected + enabled" checks live in `execute-resend.ts:108-122`.
- **The Cloud Run runner sends no email.** `apps/arc-runner/src/config.ts` reads only `APP_API_BASE_URL`, `ARC_AGENT_API_TOKEN`, `ARC_WEBHOOK_SECRET`, the Claude token, and `ARC_MODEL`. It triggers sends by calling the app API; the **app (Vercel) performs every real Resend send**. Therefore `RESEND_*` must NOT be added to Cloud Run.

## Design

### 1. Module architecture

- **`src/domain/email-templates.ts`** — pure, I/O-free.
  - `renderBrandedEmail({ heading, bodyBlocks, cta?, brand }) -> { html: string; text: string }`.
  - Brand shell: logo, header/footer, primary button, brand colors; deterministic plaintext fallback.
  - HTML-escapes all interpolated content. No `process.env`, no fetch, no Supabase.
  - Unit-tested in `src/domain/__tests__/email-templates.test.ts` (html structure, text fallback, escaping, missing-brand defaults).
- **`src/lib/email/`** — I/O wiring.
  - `sendBrandedEmail({ to, subject, heading, bodyBlocks, cta?, brand })` composes the domain renderer with `sendResendEmail`, resolving `from`/api key the same way `execute-resend.ts` does (config `fromEmail` → `RESEND_FROM`; key from `RESEND_API_KEY`). Reuse, don't duplicate, that resolution.
  - Brand data is loaded from the existing brand kit (per-org where an org context exists).

### 2. Invite cutover (the one real code change)

In `src/app/api/auth/workspace-invites/route.ts`:
- Replace `inviteUserByEmail(email, { data, redirectTo })` with
  `auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: '${origin}/auth/confirm', data: { pending_invite_code: result.code } } })`.
- `generateLink` returns the action link **without sending** — render the branded invite via `sendBrandedEmail` and send through Resend.
- Invites use the **org's** brand (we have `workspaceId` in the request).
- **Keep the existing fallback verbatim:** any send/link failure still returns `ok:true` with `emailed:false` + the `code`, so the operator can share it manually (`route.ts:41-48`). `generateLink` errors on already-registered users the same way `inviteUserByEmail` did — fallback covers it.

### 3. Env / config matrix — where each thing lives

| Setting | Vercel (app) | local `.env.local` | Supabase dashboard | Cloud Run (runner) |
|---|---|---|---|---|
| `RESEND_API_KEY` | ✅ | ✅ | — | ❌ not needed |
| `RESEND_FROM` (branded, e.g. `Arc <hello@yourdomain.com>`) | ✅ | ✅ | — | ❌ |
| Custom SMTP (`smtp.resend.com`, user `resend`, pass = Resend key, sender = branded addr) | — | — | ✅ Auth → SMTP Settings | — |
| Site URL + Redirect URLs (`/auth/confirm`, `/auth/callback`) | — | — | ✅ Auth → URL Configuration | — |
| DKIM / SPF / DMARC records | — | — | — (DNS / registrar) | — |

**Cloud Run invariant (verify, don't change):** the runner needs no email change. The only thing to confirm is that the shared Arc secrets it already uses — `ARC_AGENT_API_TOKEN`, `ARC_WEBHOOK_SECRET` (Secret Manager) — still **match** their Vercel counterparts. Verification step (no redeploy):

```bash
gcloud run services describe arc-runner --region us-central1 \
  --format='value(spec.template.spec.containers[0].env)'
```

Confirm `APP_API_BASE_URL` points at the prod app and the two secrets resolve to the same values Vercel holds. We do NOT redeploy the runner for this work.

### 4. Hosted Supabase templates (magic link / recovery / signup confirm)

These remain Supabase-sent and project-global. Add `scripts/export-auth-templates.ts` (`pnpm email:export`) that renders the same brand shell with Go placeholders (`{{ .ConfirmationURL }}`, `{{ .TokenHash }}`, `{{ .SiteURL }}`) and writes the HTML for the 3 dashboard editors. Paste once; re-run + re-paste when the brand shell changes. (Phase 2 hook eliminates this copy-paste.)

### 5. Testing & docs

- Unit tests for the domain renderer (html + text, escaping, brand defaults).
- Update the invite-route test to mock `generateLink` instead of `inviteUserByEmail`, asserting branded-send-then-fallback behavior.
- Update `.env.example` comments (clarify `RESEND_FROM` should be a branded, domain-verified address).
- Update `docs/runbooks/email-invites-setup.md`: the `generateLink`-based invite path, the `pnpm email:export` step, and a Cloud-Run "no email vars here; verify shared secrets match" line in the front-door checklist.

## Phase 2 (noted, not built)

The Supabase **Send Email Hook**: Supabase POSTs every auth email to `/api/auth/email-hook`; we verify the hook secret (`AUTH_EMAIL_HOOK_SECRET`, app + dashboard only — still never Cloud Run), render with the same brand layer, and send via Resend. Makes *all* auth emails repo-rendered and per-org, dropping step 4's dashboard copy-paste. Requires a safe fallback so a hook failure never silently blocks auth mail.

## Acceptance criteria

- Domain verified in Resend; `RESEND_FROM` is a branded address on the domain.
- Supabase custom SMTP set to Resend; Site URL + both redirect URLs configured.
- An invite email sends via Resend, branded, with a working `/auth/confirm?...` link; on any failure the route still returns the shareable code.
- `renderBrandedEmail` and the updated invite route are unit-tested and green; `pnpm lint`, `tsc`, and the email/auth test files pass.
- Cloud Run runner untouched; shared Arc secrets verified to match Vercel.
- `pnpm email:export` produces paste-ready HTML for the 3 hosted templates.
