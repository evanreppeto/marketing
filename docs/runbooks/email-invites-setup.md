# Email Invites — Delivery Setup

This runbook covers the Supabase and SMTP configuration required for `POST /api/auth/workspace-invites` to deliver invite emails reliably in production.

## 1. Supabase URL Configuration

In the Supabase dashboard for your project, go to **Authentication → URL Configuration**:

- **Site URL**: set to your production domain, e.g. `https://app.example.com`.
- **Redirect URLs**: add **both**
  - `https://app.example.com/auth/confirm` — the `redirectTo` value sent by `inviteUserByEmail` (email-link verification), and
  - `https://app.example.com/auth/callback` — used by Google OAuth sign-in.

Without this, Supabase will reject the `redirectTo` parameter and the invite link in the email will not work.

### 1a. Invite email template (OPTIONAL — only with custom SMTP)

You do **not** need to touch the template for invites to work. `/auth/confirm` accepts
**both** token shapes:

- the default template's `?code` (Supabase `{{ .ConfirmationURL }}` → `/auth/v1/verify` →
  redirects to our `redirect_to` with `?code`, which we exchange for a session), and
- a customized template's `?token_hash` + `type` (verified via OTP).

Supabase **locks template editing behind custom SMTP** (which needs a verified domain), so
until you set that up the default plain email is used — and it works via the `?code` path
as long as `/auth/confirm` is in **Redirect URLs** (below). Once you add custom SMTP and a
domain, switch the **Invite user** template link to a branded design pointing at
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`.

## 2. Custom SMTP (Resend) for Reliable Delivery

Supabase's built-in email sender is rate-limited (2 emails/hour on the free tier, low limits on Pro). For team invites that need to reach teammates reliably, configure a custom SMTP provider:

1. Sign up at [resend.com](https://resend.com) and create an API key.
2. In Supabase dashboard go to **Project Settings → Auth → SMTP Settings**.
3. Enable **Custom SMTP** and fill in:
   - **Host**: `smtp.resend.com`
   - **Port**: `465` (SSL) or `587` (STARTTLS)
   - **Username**: `resend`
   - **Password**: your Resend API key
   - **Sender email**: a verified domain address, e.g. `invites@yourdomain.com`
4. Save and send a test email to confirm delivery.

## 3. How Acceptance Works

When an invited user clicks the link in their email:

1. The link (carrying `token_hash` + `type=invite`) lands on `/auth/confirm`.
2. `/auth/confirm/route.ts` calls `supabase.auth.verifyOtp({ type, token_hash })` to establish the session, then `provisionAuthenticatedUser(user)`.
3. `provisionAuthenticatedUser` reads `user.user_metadata.pending_invite_code` (seeded into the invite by `inviteUserByEmail({ data: { pending_invite_code } })`).
4. The code is redeemed: the user is joined to the org and workspace with the role that was set when the code was issued, then routed to `/welcome`.
5. No separate code entry is needed — the link does everything.

> Google OAuth sign-in uses the separate `/auth/callback` route (`exchangeCodeForSession`). The two flows are intentionally kept apart.

## 4. Code Fallback

If the email send fails (e.g. SMTP misconfigured, recipient already registered, Supabase rate limit hit), the route still returns `ok: true` with the issued `code` and `emailed: false`. The invite form displays "Couldn't email them — share this code instead." and shows the code + Copy button, so the operator can send it manually. The code remains valid until it expires.

## 5. Local Development

Leave SMTP unconfigured locally. The form will show the code-only path (no `invitedEmail` in the request, or send will fail gracefully). Use `pnpm seed:arc-demo` to seed demo data; invite codes work independently of email delivery.

## 6. Front-door checklist (do this on every deploy)

Sign-in silently disables itself if the auth mode can't resolve. Verify, in order:

1. **Vercel env** — confirm all are set on the production deployment:
   `ARC_AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. **Supabase URL config** — Site URL = prod domain; Redirect URLs include both
   `/auth/confirm` and `/auth/callback` (§1).
3. **Invite template** — uses the `/auth/confirm?token_hash=…&type=invite` form (§1a).
4. **Verify live** — hit `GET https://<prod>/api/auth/status`. You want:
   ```json
   { "requested": "supabase", "resolved": "supabase", "supabaseConfigured": true }
   ```
   If `resolved` is `"open"` while `requested` is `"supabase"`, the Supabase URL/anon
   key are missing — sign-in is disabled and the server logs an
   `[auth] ARC_AUTH_MODE=supabase requested but …` warning. Fix env and redeploy.
