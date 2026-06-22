# Email Team Invites — Design

**Date:** 2026-06-20
**Status:** Approved (design)
**Scope:** When an operator enters a teammate's email in the Team-settings invite form, actually **send an invite email** (via Supabase `inviteUserByEmail`) that, on click, joins them to the workspace with the chosen role — reusing the existing invite-code + acceptance flow. The shareable code stays as a fallback.

## Problem

The invite form (`workspace-invite-form.tsx`) already collects an email (labeled "Email restriction"), `POST /api/auth/workspace-invites` already creates a `workspace_invites` row with `invited_email` + a code, and `/auth/callback` → `provisionAuthenticatedUser` already redeems a `pending_invite_code` to join the workspace. The missing piece: **nothing emails the teammate** — the operator just gets a code to copy/paste. We want a real "invite by email."

## What exists (reuse — almost everything)

- `POST /api/auth/workspace-invites` → `issueWorkspaceInviteCode({ workspaceId, invitedEmail?, role, expiresInDays })` → `{ ok, code, expiresAt }` (records `invited_email`).
- Acceptance: `/auth/callback/route.ts` runs `provisionAuthenticatedUser(user)`, which reads `user.user_metadata.pending_invite_code` and redeems the matching invite (joins org+workspace with the invite's role). **Untouched.**
- `getSupabaseAdminClient()` (service role) → `auth.admin.inviteUserByEmail(email, { data, redirectTo })`.
- The form posts `{ invitedEmail?, role, expiresInDays, workspaceId }` and renders the returned code.

## Architecture

### a. Route — `POST /api/auth/workspace-invites` (`route.ts`)
After `issueWorkspaceInviteCode` succeeds, if `invitedEmail` is a non-empty string, send the invite:
```ts
const origin = new URL(request.url).origin;
try {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(invitedEmail, {
    data: { pending_invite_code: result.code },
    redirectTo: `${origin}/auth/callback`,
  });
  return NextResponse.json({ ...result, emailed: !error, emailError: error?.message ?? null });
} catch (e) {
  return NextResponse.json({ ...result, emailed: false, emailError: e instanceof Error ? e.message : "Invite email could not be sent." });
}
```
- The code (`result.code`) is seeded into the invited user's metadata as `pending_invite_code`, so acceptance reuses the existing redemption path with the invite's role.
- **Graceful:** a send failure (e.g. email already registered, rate limit) never fails the request — the code is still returned (`ok: true`) with `emailed: false` + a reason, so the operator can fall back to sharing the code.
- No-email submissions are unchanged (`emailed` omitted/false; code returned as today).

### b. Form — `workspace-invite-form.tsx`
- Relabel the email field from "Email restriction" to **"Invite by email (optional)"** with helper text "We'll email them a join link. Leave blank to just generate a code."
- Button label: **"Send invite"** when the email field has a value, else "Generate invite code".
- Result handling: read `emailed`/`emailError` from the response. On `emailed: true` → show **"Invited {email}"** confirmation, and still show the code (manual fallback). On `emailed: false` with an email entered → show "Couldn't email them — share this code instead" + the code. No email → today's code display.
- `InviteResult` type extended with optional `emailed?: boolean; emailError?: string | null`.

### c. Acceptance — unchanged
Recipient clicks the Supabase invite link → authenticated session (metadata carries `pending_invite_code`) → `/auth/callback` → `provisionAuthenticatedUser` redeems → joins workspace with role. Invited users are auto-confirmed by the link.

## ⚠️ Delivery prerequisite (operator config — documented in a runbook, not code)

`inviteUserByEmail` sends via Supabase email and its link honors Supabase's URL config. For invites to arrive and not bounce to `localhost`:
- **Authentication → URL Configuration:** Site URL = prod domain; add `https://<prod>/auth/callback` to **Redirect URLs**.
- Built-in Supabase email is **rate-limited**; for reliable team invites configure **custom SMTP** (Resend). Without this, some invites won't send — the form's `emailed: false` fallback (share the code) covers that case.

Captured as `docs/runbooks/email-invites-setup.md` in the PR.

## Testing

- **Route:** with `invitedEmail` → `inviteUserByEmail` called with `{ data: { pending_invite_code: <code> }, redirectTo: ".../auth/callback" }`; response includes `emailed: true`. Send error → `ok: true` still, `emailed: false` + `emailError`. No `invitedEmail` → `inviteUserByEmail` NOT called. (Mock `issueWorkspaceInviteCode` + the admin client.)
- **Form:** (light) the result branch renders "Invited {email}" when `emailed`, code-copy otherwise. (Component test optional; logic is small.)
- Full `pnpm build`.

## Safety & scope

- Reuses the existing invite + acceptance + role flow; only adds the send + UI affordance. No new table, no acceptance changes.
- Best-effort send (never blocks issuing the code). Admin-only (service-role) call in a route already gated by `issueWorkspaceInviteCode`'s auth.
- Delivery reliability depends on the documented Supabase email config (built-in is rate-limited).

## Out of scope

- A bespoke Resend-API invite template (the later swap; the send step is the only thing that would change).
- Resend/expiry/bulk-invite management UI.
- Changing how acceptance or roles work.
