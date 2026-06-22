# Email Team Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entering a teammate's email in the Team invite form sends a real invite email (Supabase `inviteUserByEmail`) that joins them to the workspace with the chosen role on click, reusing the existing code + acceptance flow. The code remains a fallback.

**Architecture:** Add the email send to `POST /api/auth/workspace-invites` after the code is issued (seed `pending_invite_code` into invite metadata; best-effort). Update the form to send + reflect "Invited {email}". Acceptance (`/auth/callback` → `provisionAuthenticatedUser`) is unchanged. Plus a delivery-config runbook.

**Tech Stack:** Next.js 16 route handler, React client form, Vitest, Supabase admin auth.

**Test command:** `pnpm test <path>`.

**Verified facts:**
- `POST /api/auth/workspace-invites` (`src/app/api/auth/workspace-invites/route.ts`): parses body, calls `issueWorkspaceInviteCode({ workspaceId, invitedEmail?, role?, expiresInDays? })` → on success returns `result` = `{ ok:true, code, expiresAt, … }`; on failure returns `result` with `statusCodeFor(result.status)`.
- `getSupabaseAdminClient()` (`@/lib/supabase/server`) is a service-role supabase-js client → `client.auth.admin.inviteUserByEmail(email, { data, redirectTo })`.
- Acceptance: `/auth/callback/route.ts` → `provisionAuthenticatedUser(user)` reads `user.user_metadata.pending_invite_code` and redeems it (joins org+workspace w/ role). **Do not modify.**
- Form (`src/app/settings/workspace-invite-form.tsx`): client component, posts `{ invitedEmail?, role, expiresInDays, workspaceId }` to the route, renders `InviteResult = { ok:true, code, expiresAt } | { ok:false, message, status? }`. Email field `name="invitedEmail"`.

---

## File Structure
- `src/app/api/auth/workspace-invites/route.ts` (modify) + `route.test.ts` (create/extend)
- `src/app/settings/workspace-invite-form.tsx` (modify)
- `docs/runbooks/email-invites-setup.md` (create)

---

## Task 1: Route — send the invite email

**Files:** `src/app/api/auth/workspace-invites/route.ts` + `route.test.ts`

- [ ] **Step 1: Write the failing test** (`route.test.ts` — mock `@/lib/auth/workspace-invites` `issueWorkspaceInviteCode` + `@/lib/supabase/server` `getSupabaseAdminClient`)

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/workspace-invites", () => ({ issueWorkspaceInviteCode: vi.fn(), cancelWorkspaceInvite: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdminClient: vi.fn() }));
import { issueWorkspaceInviteCode } from "@/lib/auth/workspace-invites";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { POST } from "./route";

const issue = vi.mocked(issueWorkspaceInviteCode);
const adminFor = vi.mocked(getSupabaseAdminClient);
const inviteUserByEmail = vi.fn();
function req(body: unknown) {
  return new Request("https://app.example.com/api/auth/workspace-invites", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  issue.mockReset(); inviteUserByEmail.mockReset();
  issue.mockResolvedValue({ ok: true, code: "ABC123", expiresAt: "2026-07-01T00:00:00Z" } as never);
  inviteUserByEmail.mockResolvedValue({ data: {}, error: null });
  adminFor.mockReturnValue({ auth: { admin: { inviteUserByEmail } } } as never);
});

describe("POST /api/auth/workspace-invites email send", () => {
  it("emails the invite (seeding pending_invite_code) when invitedEmail is given", async () => {
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "teammate@co.com" }));
    expect(inviteUserByEmail).toHaveBeenCalledWith("teammate@co.com", {
      data: { pending_invite_code: "ABC123" },
      redirectTo: "https://app.example.com/auth/callback",
    });
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: true });
  });
  it("does NOT email when no invitedEmail (code-only)", async () => {
    const res = await POST(req({ workspaceId: "w1", role: "member" }));
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123" });
  });
  it("still returns ok+code with emailed:false when the send errors", async () => {
    inviteUserByEmail.mockResolvedValue({ data: null, error: { message: "already registered" } });
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "dup@co.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: false, emailError: "already registered" });
  });
  it("does not email when issuing the code failed", async () => {
    issue.mockResolvedValue({ ok: false, status: "invalid_input", message: "bad" } as never);
    const res = await POST(req({ workspaceId: "", role: "member", invitedEmail: "x@co.com" }));
    expect(res.status).toBe(400);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm test src/app/api/auth/workspace-invites/route.test.ts`).

- [ ] **Step 3: Implement** in `route.ts` POST — add imports and the send after a successful issue:

```typescript
import { getSupabaseAdminClient } from "@/lib/supabase/server";
// …
  if (!result.ok) {
    return NextResponse.json(result, { status: statusCodeFor(result.status) });
  }

  const invitedEmail = typeof body.invitedEmail === "string" ? body.invitedEmail.trim() : "";
  if (invitedEmail) {
    const origin = new URL(request.url).origin;
    try {
      const { error } = await getSupabaseAdminClient().auth.admin.inviteUserByEmail(invitedEmail, {
        data: { pending_invite_code: result.code },
        redirectTo: `${origin}/auth/callback`,
      });
      return NextResponse.json({ ...result, emailed: !error, emailError: error?.message ?? null });
    } catch (error) {
      return NextResponse.json({
        ...result,
        emailed: false,
        emailError: error instanceof Error ? error.message : "Invite email could not be sent.",
      });
    }
  }

  return NextResponse.json(result);
```
(`result.code` is the issued code. The send is best-effort: any failure still returns `ok:true` + the code, with `emailed:false`.)

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/api/auth/workspace-invites && git commit -m "feat(auth): email team invites via inviteUserByEmail (best-effort, code fallback)"`

---

## Task 2: Form — send affordance + result

**Files:** `src/app/settings/workspace-invite-form.tsx`

- [ ] **Step 1: Extend `InviteResult`** to include the new fields on the ok branch:
```typescript
type InviteResult =
  | { ok: true; code: string; expiresAt: string; emailed?: boolean; emailError?: string | null }
  | { ok: false; message: string; status?: string };
```
- [ ] **Step 2: Track the entered email** for UI labels — add `const [email, setEmail] = useState("")` and bind the email input (`value={email} onChange={(e)=>setEmail(e.target.value)}`); keep `name="invitedEmail"`.
- [ ] **Step 3: Relabel** the email field: title → **"Invite by email (optional)"**, helper → "We'll email them a join link. Leave blank to just generate a code."
- [ ] **Step 4: Button label** dynamic: `{email.trim() ? "Send invite" : "Generate invite code"}` (and the spinner text "Sending invite..." / "Issuing code...").
- [ ] **Step 5: Result rendering** (the `result.ok` branch): if `result.emailed` → prepend a confirmation line **"Invited {email}"** (use the submitted email); if an email was entered but `result.emailed === false` → show "Couldn't email them — share this code instead." Always still render the code + Copy (fallback). No-email submissions unchanged.
- [ ] **Step 6: Verify** `npx tsc --noEmit` clean. (Form logic; covered by build. Optional: a tiny render test if the file has a test harness — not required.)
- [ ] **Step 7: Commit** — `git add src/app/settings/workspace-invite-form.tsx && git commit -m "feat(auth): invite form sends email + shows 'Invited {email}' (code fallback)"`

---

## Task 3: Runbook + build

- [ ] **Step 1: Write `docs/runbooks/email-invites-setup.md`** — the delivery prerequisites:
  - Supabase → **Authentication → URL Configuration**: Site URL = prod domain; Redirect URLs include `https://<prod>/auth/callback`.
  - Built-in email is rate-limited → configure **custom SMTP** (Resend) for reliable team invites.
  - How acceptance works (recipient clicks → joins workspace with role); the code fallback when an email can't be sent.
- [ ] **Step 2:** `pnpm test src/app/api/auth/workspace-invites/route.test.ts` → pass.
- [ ] **Step 3:** `pnpm build` → succeeds (`pnpm install` first if deps missing). Fix only feature-caused failures.
- [ ] **Step 4: Commit** — `git add docs/runbooks/email-invites-setup.md && git commit -m "docs: email-invites delivery setup runbook"` (+ any build fixups).

---

## Self-Review (plan author)

- **Spec coverage:** route send + best-effort + no-email skip → Task 1; form affordance/result + `InviteResult` extension → Task 2; runbook + build → Task 3. Acceptance untouched (spec). All covered.
- **Placeholder scan:** none. Route code + test are exact; form steps are concrete edits to a fully-read file.
- **Type consistency:** route returns `{ ...result, emailed, emailError }`; form's `InviteResult.ok` extended with the same optional fields. `inviteUserByEmail(email, { data:{ pending_invite_code }, redirectTo })` matches the supabase-js admin signature; `pending_invite_code` is exactly what `provisionAuthenticatedUser` reads. `result.code` is the issued code field.
- **Safety:** best-effort send never blocks code issuance (failure → `ok:true`, `emailed:false`); no-email path unchanged; acceptance/roles/table untouched; admin call inside the already-auth-gated issue path. Delivery reliability documented as Supabase config (runbook), with the code fallback covering send failures.
