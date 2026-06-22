# Email Invites — Delivery Setup

This runbook covers the Supabase and SMTP configuration required for `POST /api/auth/workspace-invites` to deliver invite emails reliably in production.

## 1. Supabase URL Configuration

In the Supabase dashboard for your project, go to **Authentication → URL Configuration**:

- **Site URL**: set to your production domain, e.g. `https://app.example.com`.
- **Redirect URLs**: add `https://app.example.com/auth/callback` (the exact `redirectTo` value sent by `inviteUserByEmail`).

Without this, Supabase will reject the `redirectTo` parameter and the invite link in the email will not work.

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

1. Supabase processes the invite token and redirects to `/auth/callback` with a session.
2. `/auth/callback/route.ts` calls `provisionAuthenticatedUser(user)`.
3. `provisionAuthenticatedUser` reads `user.user_metadata.pending_invite_code` (seeded into the invite by `inviteUserByEmail({ data: { pending_invite_code } })`).
4. The code is redeemed: the user is joined to the org and workspace with the role that was set when the code was issued.
5. No separate code entry is needed — the link does everything.

## 4. Code Fallback

If the email send fails (e.g. SMTP misconfigured, recipient already registered, Supabase rate limit hit), the route still returns `ok: true` with the issued `code` and `emailed: false`. The invite form displays "Couldn't email them — share this code instead." and shows the code + Copy button, so the operator can send it manually. The code remains valid until it expires.

## 5. Local Development

Leave SMTP unconfigured locally. The form will show the code-only path (no `invitedEmail` in the request, or send will fail gracefully). Use `pnpm seed:arc-demo` to seed demo data; invite codes work independently of email delivery.
