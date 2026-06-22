# Invite Acceptance — "Finish Your Account" Screen — Design

**Date:** 2026-06-20
**Status:** Approved (design)
**Scope:** When an invited teammate clicks their email link, instead of being silently dropped at the app home with no password, land them on a dedicated **`/welcome`** screen that confirms the workspace + role they're joining and has them set their **name + password** — then into the app. Fixes the "the workflow is off" UX.

## Problem

Email invites use Supabase `inviteUserByEmail` → magic link → `/auth/callback` → `provisionAuthenticatedUser` redeems the invite and joins the workspace → callback redirects to `next` (default `/`). So the invitee:
- never sees a "you're joining Big Shoulders Restoration" screen, and
- has **no password** (Supabase-invited users have none) — so they can only ever return via another magic link.

We want a proper acceptance screen: the link carries the invite (no code typing), and on arrival they finish creating their account.

## What exists (reuse)

- `/auth/callback/route.ts`: runs `provisionAuthenticatedUser(user)`; on `status === "profile_only"` → `/onboarding`; otherwise → `next`. `provisionAuthenticatedUser` returns **`status: "invited_member"`** on the first redemption of a `pending_invite_code` (vs `existing_member` for returning logins).
- `getCurrentWorkspaceContext()` (`src/lib/auth/workspace.ts`) → `{ orgId, workspaceId, workspaceName, role, … }` — the workspace + role to display.
- `src/lib/supabase/auth-server.ts` — the SSR, cookie/session-scoped Supabase client (acts as the signed-in user) → `supabase.auth.updateUser({ password, data })`.
- Existing auth UI patterns (sign-in/sign-up pages, `page-header` primitives) + password rules (min length used at sign-up).

## Behavior

1. Invitee clicks the email link → `/auth/callback` establishes a session and `provisionAuthenticatedUser` joins them (status `invited_member`).
2. **Callback redirects to `/welcome`** (instead of `/`) on `invited_member`.
3. `/welcome` shows **"You've joined {workspaceName} as {role}"** + a form: **Full name**, **Password**, **Confirm password**.
4. Submit → set the user's password + name via `updateUser` → redirect into the app (`/`). They now have real credentials and can sign in normally.

## Architecture

### a. Callback redirect — `src/app/auth/callback/route.ts`
After `provisionAuthenticatedUser`: add — `if (provisioned.ok && provisioned.status === "invited_member") return redirect("/welcome?from=…")`. Keep the existing `profile_only → /onboarding` and default-`next` branches.

### b. `/welcome` page — `src/app/welcome/page.tsx` (new, server component)
- Require a session: `getCurrentWorkspaceContext()` — if it throws/no workspace, redirect to `/login` (defensive; an accepted invite always has one).
- Render `WelcomeAccountForm` with `{ workspaceName, role }` for the heading.
- No nav chrome (the app-shell already bypasses chrome for auth-ish routes; add `/welcome` to that bypass list in `console-frame.tsx` like `/onboarding`).

### c. `WelcomeAccountForm` — `src/app/welcome/welcome-form.tsx` (new, client)
- Fields: full name, password, confirm. Client-validate: password ≥ 8 (match sign-up rule), confirm equals.
- Submits to a server action `completeInvitedAccountAction(formData)`.

### d. Server action — `src/app/welcome/actions.ts` (new, `"use server"`)
- `requireOperator()`-style session check (or just use the auth-server client + `getUser()`); validate name/password.
- `const supabase = <auth-server SSR client>; await supabase.auth.updateUser({ password, data: { full_name } });`
- On error → return `{ ok:false, message }`; on success → `redirect("/")` (revalidate as needed).

## Testing

- **Callback:** `invited_member` status → redirects to `/welcome`; `existing_member`/default → unchanged (`next`); `profile_only` → `/onboarding` (unchanged). (Extend `auth/callback/route.test.ts`.)
- **Action:** valid name+password → calls `updateUser({ password, data:{ full_name } })` then redirects; mismatch/short password → validation error, no `updateUser`; `updateUser` error → `{ ok:false }`. (Mock the auth-server client.)
- **Form:** (light) confirm-mismatch + short-password disable/err; renders the workspace + role heading.
- Full `pnpm build`.

## Safety & scope

- No change to invite creation/sending (#184) or to `provisionAuthenticatedUser`'s join logic — only the post-acceptance redirect + the new screen.
- A returning member (already has a password) signs in → `existing_member` → goes to `/` as before (never sees `/welcome`).
- If an invitee abandons `/welcome` without setting a password, they're still a member; they can set a password later via password reset. (v1 acceptable; not a stuck state.)
- Email **content** wording is a Supabase dashboard template tweak (not code); noted in the invite runbook.

## Out of scope

- Customizing the Supabase invite email HTML beyond a dashboard copy tweak.
- Forcing password set on every future login if skipped (v1 shows it once on acceptance).
- Profile fields beyond name (avatar, etc.).
- The Resend/custom-domain email path (separate, later).
