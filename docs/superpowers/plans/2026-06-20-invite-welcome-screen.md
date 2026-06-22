# Invite "Finish Your Account" Welcome Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An invited teammate who clicks their email link lands on `/welcome` — "You've joined {workspace} as {role}" + set name & password — instead of being silently dropped at the app home with no password.

**Architecture:** `/auth/callback` redirects to `/welcome` on `provisioned.status === "invited_member"`. New `/welcome` server page (reads `getCurrentWorkspaceContext`) + client form → server action calls `supabase.auth.updateUser({ password, data: { full_name } })` via the SSR session client → into the app. No change to invite send/join.

**Tech Stack:** Next.js 16 App Router (server + client components, server actions), Vitest, Supabase SSR auth.

**Test command:** `pnpm test <path>`.

**Verified facts:**
- `src/app/auth/callback/route.ts`: after `provisionAuthenticatedUser(data.user)`, branches `!ok → /login?error=provision`, `status==="profile_only" → /onboarding`, else `→ next` (default `/`). Redirects via `NextResponse.redirect(new URL(path, url.origin), { status: 303 })`. `provisioned.status === "invited_member"` is returned on first invite redemption.
- `src/lib/supabase/auth-server.ts`: `createSupabaseAuthServerClient()` (cookie/session SSR client) + `getSupabaseAuthenticatedUser()`.
- `getCurrentWorkspaceContext()` (`@/lib/auth/workspace`) → `{ workspaceName, role, … }`; throws when no session/workspace.
- `src/app/onboarding/actions.ts` is the server-action template (`"use server"`, `getSupabaseAuthenticatedUser`, `redirect(...)`).
- `console-frame.tsx` bypasses chrome for `pathname === "/login" | "/sign-in" | "/sign-up" | "/forgot-password" | "/onboarding"` — add `/welcome`.
- Password min length at sign-up is **8** (match it).

---

## File Structure
- `src/app/auth/callback/route.ts` (modify) + `route.test.ts` (extend)
- `src/app/welcome/page.tsx` (create)
- `src/app/welcome/welcome-form.tsx` (create, client)
- `src/app/welcome/actions.ts` (create, `"use server"`) + `actions.test.ts`
- `src/app/_components/console-frame.tsx` (modify — chrome bypass)

---

## Task 1: Callback → /welcome on invited_member

**Files:** `src/app/auth/callback/route.ts` + `route.test.ts`

- [ ] **Step 1: Extend the test** (`auth/callback/route.test.ts`) — mirror its existing mock of `provisionAuthenticatedUser` + `createSupabaseAuthServerClient`:
  - `provisioned = { ok:true, status:"invited_member", orgId, workspaceId }` → response redirects (303) to `/welcome?from=…`.
  - `status:"existing_member"` (or default ok) → redirects to `next` (`/`) — unchanged.
  - `status:"profile_only"` → `/onboarding` — unchanged.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — insert before the `profile_only` branch:
```typescript
    if (provisioned.status === "invited_member") {
      return NextResponse.redirect(
        new URL(`/welcome?from=${encodeURIComponent(next)}`, url.origin),
        { status: 303 },
      );
    }
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/auth/callback && git commit -m "feat(auth): route invited members to /welcome after acceptance"`

---

## Task 2: `/welcome` screen — page + form + action

**Files:** `src/app/welcome/{page.tsx,welcome-form.tsx,actions.ts,actions.test.ts}`; `src/app/_components/console-frame.tsx`

- [ ] **Step 1: Write the failing action test** (`actions.test.ts`) — mock `@/lib/supabase/auth-server`:
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const updateUser = vi.fn();
const getUser = vi.fn();
vi.mock("@/lib/supabase/auth-server", () => ({
  createSupabaseAuthServerClient: vi.fn(async () => ({ auth: { getUser, updateUser } })),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn((p: string) => { throw new Error(`REDIRECT:${p}`); }) }));
import { completeInvitedAccountAction } from "./actions";

function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }
beforeEach(() => { updateUser.mockReset().mockResolvedValue({ error: null }); getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } }); });

describe("completeInvitedAccountAction", () => {
  it("rejects a short password (no updateUser)", async () => {
    const r = await completeInvitedAccountAction(null, fd({ fullName: "Ann", password: "short", confirm: "short" }));
    expect(r).toMatchObject({ ok: false });
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("rejects a mismatch", async () => {
    const r = await completeInvitedAccountAction(null, fd({ fullName: "Ann", password: "longenough1", confirm: "different1" }));
    expect(r).toMatchObject({ ok: false });
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("sets password + name then redirects home", async () => {
    await expect(completeInvitedAccountAction(null, fd({ fullName: "Ann Lee", password: "longenough1", confirm: "longenough1" })))
      .rejects.toThrow("REDIRECT:/");
    expect(updateUser).toHaveBeenCalledWith({ password: "longenough1", data: { full_name: "Ann Lee" } });
  });
  it("returns the error when updateUser fails", async () => {
    updateUser.mockResolvedValue({ error: { message: "weak password" } });
    const r = await completeInvitedAccountAction(null, fd({ fullName: "Ann", password: "longenough1", confirm: "longenough1" }));
    expect(r).toMatchObject({ ok: false, message: "weak password" });
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `actions.ts`**:
```typescript
"use server";

import { redirect } from "next/navigation";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export type WelcomeActionState = { ok: false; message: string } | null;

export async function completeInvitedAccountAction(
  _previous: WelcomeActionState,
  formData: FormData,
): Promise<WelcomeActionState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (password !== confirm) return { ok: false, message: "Those passwords don't match." };

  const supabase = await createSupabaseAuthServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?from=%2Fwelcome");

  const { error } = await supabase.auth.updateUser({
    password,
    data: fullName ? { full_name: fullName } : {},
  });
  if (error) return { ok: false, message: error.message };

  redirect("/");
}
```
- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Create `welcome-form.tsx`** (client) — `useActionState(completeInvitedAccountAction, null)`; props `{ workspaceName: string; role: string }`. Fields: Full name (`name="fullName"`), Password (`name="password"` type password), Confirm (`name="confirm"` type password). Heading: **"You've joined {workspaceName}"** + subtext "as {role} — set your name and a password to finish." Submit button "Finish setup" (disabled while pending). Render `state?.message` as an error. Reuse the input styling + `Button` from `@/app/_components/page-header` (mirror `workspace-invite-form.tsx`'s `inputClass`). Match `DESIGN.md` / the sign-up page's auth-card look.

- [ ] **Step 6: Create `page.tsx`** (server):
```tsx
import { redirect } from "next/navigation";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

import { WelcomeAccountForm } from "./welcome-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finish setup" };

export default async function WelcomePage() {
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx) redirect("/login?from=%2Fwelcome");
  return <WelcomeAccountForm workspaceName={ctx.workspaceName} role={ctx.role ?? "member"} />;
}
```
(Center it in the same auth-page shell the sign-up/login pages use — check how `/sign-up/page.tsx` wraps its form and mirror that container so `/welcome` looks like the other auth screens.)

- [ ] **Step 7: Chrome bypass** — in `src/app/_components/console-frame.tsx`, add `pathname === "/welcome"` to the early-return list alongside `/onboarding` etc. (so `/welcome` renders without the app sidebar).

- [ ] **Step 8: Typecheck** — `npx tsc --noEmit` clean.

- [ ] **Step 9: Commit** — `git add src/app/welcome src/app/_components/console-frame.tsx && git commit -m "feat(auth): /welcome finish-account screen for invited members"`

---

## Task 3: Build + verify

- [ ] **Step 1:** `pnpm test src/app/auth/callback/route.test.ts src/app/welcome/actions.test.ts` → pass.
- [ ] **Step 2:** `pnpm build` → succeeds (`pnpm install` first if deps missing). Fix only feature-caused failures.
- [ ] **Step 3 (preview, optional):** if a dev server runs, hit `/welcome` while signed in → confirm the form renders without app chrome and shows the workspace/role. (Locally Supabase may be unreachable; the build + action tests are the gate.)
- [ ] **Step 4 (if fixups):** `git add -A && git commit -m "fix(auth): welcome-screen verification fixups"`

---

## Self-Review (plan author)

- **Spec coverage:** callback redirect on `invited_member` → Task 1; `/welcome` page + form + `updateUser` action + chrome bypass → Task 2; build → Task 3. Matches spec.
- **Placeholder scan:** none. The form (Step 5) is described concretely (fields, names, copy, reuse `inputClass`/`Button`); the action + page + test are exact code.
- **Type/flow consistency:** action reads `fullName/password/confirm`, calls `updateUser({ password, data:{ full_name } })` (test asserts exact arg), `redirect("/")` on success (test asserts the throw). Page passes `workspaceName`/`role` from `getCurrentWorkspaceContext`. Callback inserts the branch using the file's existing `NextResponse.redirect(new URL(...), {status:303})` idiom.
- **Safety:** no change to invite send/join or `provisionAuthenticatedUser`; returning members (`existing_member`) still go to `/`; `/welcome` requires a session (else `/login`); abandoning the screen leaves a valid member who can use password-reset later (per spec). Pure additive screen.
