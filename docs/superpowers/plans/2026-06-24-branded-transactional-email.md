# Branded Transactional Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send invite emails reliably and branded through Resend, render them from one repo-owned template layer, and document the exact env/config (incl. the explicit "no email vars on Cloud Run" rule) needed to make auth email work in prod.

**Architecture:** A pure domain renderer (`src/domain/email-templates.ts`) produces `{html,text}` from brand inputs. A thin I/O layer (`src/lib/email/`) resolves the org brand + Resend creds and sends. The invite route stops letting Supabase send (`generateLink` instead of `inviteUserByEmail`) and renders/sends the branded invite itself, keeping the existing code-fallback. Supabase-sent auth emails (magic link / recovery / signup confirm) are branded via an exported-HTML script. The Cloud Run runner is untouched — it sends no email.

**Tech Stack:** TypeScript, Next.js 16 route handlers, Supabase Admin SDK (`auth.admin.generateLink`), Resend HTTP API (existing `sendResendEmail`), Vitest, `tsx` (dev-only, for the export script).

---

## File Structure

- `src/domain/email-templates.ts` — **create.** Pure renderer + types (`BrandEmailTheme`, `EmailCta`, `renderBrandedEmail`). No I/O.
- `src/domain/__tests__/email-templates.test.ts` — **create.** Unit tests for the renderer.
- `src/domain/index.ts` — **modify.** Re-export the new public symbols.
- `src/lib/email/index.ts` — **create.** `resolveBrandEmailTheme()` + `sendBrandedEmail()`.
- `src/lib/email/index.test.ts` — **create.** Tests for `sendBrandedEmail` (mock the Resend send).
- `src/app/api/auth/workspace-invites/route.ts` — **modify.** Swap to `generateLink` + `sendBrandedEmail`.
- `src/app/api/auth/workspace-invites/route.test.ts` — **modify.** Mock `generateLink` + `@/lib/email`.
- `scripts/export-auth-templates.ts` — **create.** Writes paste-ready hosted-template HTML.
- `package.json` — **modify.** Add `tsx` devDependency + `email:export` script.
- `.env.example` — **modify.** Clarify `RESEND_FROM` must be a branded, domain-verified address.
- `docs/runbooks/email-invites-setup.md` — **modify.** New invite path, env matrix, Cloud Run note, `email:export` step.

---

## Task 1: Pure branded-email renderer

**Files:**
- Create: `src/domain/email-templates.ts`
- Test: `src/domain/__tests__/email-templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/email-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { renderBrandedEmail } from "@/domain";

const theme = { appName: "Summit", logoUrl: "https://cdn.example.com/logo.png", accentColor: "#0B0B0C" };

describe("renderBrandedEmail", () => {
  it("renders heading, body paragraphs, and a CTA button in the html", () => {
    const { html } = renderBrandedEmail({
      heading: "Join Summit",
      bodyBlocks: ["You've been invited.", "Click below to accept."],
      cta: { label: "Accept invitation", url: "https://app.example.com/auth/confirm?code=abc" },
      theme,
    });
    expect(html).toContain("Join Summit");
    expect(html).toContain("You&#39;ve been invited.");
    expect(html).toContain("Click below to accept.");
    expect(html).toContain('href="https://app.example.com/auth/confirm?code=abc"');
    expect(html).toContain("Accept invitation");
    expect(html).toContain('src="https://cdn.example.com/logo.png"');
  });

  it("produces a plaintext alternative with the CTA url spelled out", () => {
    const { text } = renderBrandedEmail({
      heading: "Join Summit",
      bodyBlocks: ["You've been invited."],
      cta: { label: "Accept invitation", url: "https://app.example.com/x" },
      theme,
    });
    expect(text).toContain("Join Summit");
    expect(text).toContain("You've been invited.");
    expect(text).toContain("Accept invitation: https://app.example.com/x");
  });

  it("escapes html in body content and omits the logo + button when not provided", () => {
    const { html } = renderBrandedEmail({
      heading: "Hi <there>",
      bodyBlocks: ["A & B <script>"],
      theme: { appName: "Summit", accentColor: "#0B0B0C" },
    });
    expect(html).toContain("Hi &lt;there&gt;");
    expect(html).toContain("A &amp; B &lt;script&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/email-templates.test.ts`
Expected: FAIL — `renderBrandedEmail` is not exported from `@/domain`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/email-templates.ts`:

```ts
// Pure, I/O-free transactional email renderer. Produces an email-safe HTML body
// (inline styles, no external CSS) plus a plaintext alternative. The single brand
// shell used by both app-driven sends and the hosted-template export script.

export type BrandEmailTheme = {
  appName: string;
  logoUrl?: string | null;
  /** Hex color for the CTA button + heading accent. */
  accentColor: string;
};

export type EmailCta = { label: string; url: string };

export type BrandedEmailInput = {
  heading: string;
  bodyBlocks: string[];
  cta?: EmailCta;
  theme: BrandEmailTheme;
  footerNote?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBrandedEmail(input: BrandedEmailInput): { html: string; text: string } {
  const { heading, bodyBlocks, cta, theme, footerNote } = input;
  const accent = theme.accentColor;

  const logo = theme.logoUrl
    ? `<img src="${escapeHtml(theme.logoUrl)}" alt="${escapeHtml(theme.appName)}" height="32" style="height:32px;display:block" />`
    : `<strong style="font-size:18px;color:#0B0B0C">${escapeHtml(theme.appName)}</strong>`;

  const paragraphs = bodyBlocks
    .map((block) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f1f23">${escapeHtml(block)}</p>`)
    .join("");

  const button = cta
    ? `<a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${escapeHtml(accent)};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600">${escapeHtml(cta.label)}</a>`
    : "";

  const footer = footerNote
    ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#8a8a8f">${escapeHtml(footerNote)}</p>`
    : "";

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f4;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="padding-bottom:24px">${logo}</td></tr>
<tr><td><h1 style="margin:0 0 16px;font-size:20px;color:#0B0B0C">${escapeHtml(heading)}</h1>${paragraphs}${button ? `<div style="margin:24px 0">${button}</div>` : ""}${footer}</td></tr>
</table></td></tr></table></body></html>`;

  const textLines = [heading, "", ...bodyBlocks];
  if (cta) textLines.push("", `${cta.label}: ${cta.url}`);
  if (footerNote) textLines.push("", footerNote);
  const text = textLines.join("\n");

  return { html, text };
}
```

- [ ] **Step 4: Wire the re-export**

In `src/domain/index.ts`, add alongside the other re-exports:

```ts
export {
  renderBrandedEmail,
  type BrandEmailTheme,
  type EmailCta,
  type BrandedEmailInput,
} from "./email-templates";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/email-templates.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/email-templates.ts src/domain/__tests__/email-templates.test.ts src/domain/index.ts
git commit -m "feat(email): pure branded transactional email renderer"
```

---

## Task 2: Brand-theme resolution + Resend send wrapper

**Files:**
- Create: `src/lib/email/index.ts`
- Test: `src/lib/email/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/email/index.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendBrandedEmail } from "./index";

const theme = { appName: "Summit", accentColor: "#0B0B0C" };

describe("sendBrandedEmail", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  it("returns ok:false when Resend creds are missing", async () => {
    const result = await sendBrandedEmail({ to: "a@b.com", subject: "Hi", heading: "Hi", bodyBlocks: ["x"], theme });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/RESEND/);
  });

  it("renders + sends via the injected sender and returns the provider id", async () => {
    const send = vi.fn().mockResolvedValue({ id: "msg_123" });
    const result = await sendBrandedEmail(
      { to: "a@b.com", subject: "Hi", heading: "Hi", bodyBlocks: ["x"], theme },
      { send, apiKey: "re_test", from: "Summit <hi@summit.com>" },
    );
    expect(result).toEqual({ ok: true, id: "msg_123" });
    expect(send).toHaveBeenCalledWith("re_test", expect.objectContaining({
      from: "Summit <hi@summit.com>",
      to: ["a@b.com"],
      subject: "Hi",
      html: expect.stringContaining("Hi"),
      text: expect.stringContaining("Hi"),
    }));
  });

  it("returns ok:false with the error message when the send throws", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Resend 422"));
    const result = await sendBrandedEmail(
      { to: "a@b.com", subject: "Hi", heading: "Hi", bodyBlocks: ["x"], theme },
      { send, apiKey: "re_test", from: "Summit <hi@summit.com>" },
    );
    expect(result).toEqual({ ok: false, error: "Resend 422" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/email/index.test.ts`
Expected: FAIL — `./index` has no `sendBrandedEmail`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/email/index.ts`:

```ts
import {
  buildResendEmailPayload,
  renderBrandedEmail,
  type BrandEmailTheme,
  type EmailCta,
  type ResendEmailPayload,
} from "@/domain";

import { resolveBrandIdentity } from "@/lib/brand-kit/identity";
import { sendResendEmail } from "@/lib/connections/resend-client";

const DEFAULT_THEME: BrandEmailTheme = { appName: "Arc", accentColor: "#0B0B0C" };

/** Per-org email theme from the Brand Kit; safe defaults when unavailable. */
export async function resolveBrandEmailTheme(): Promise<BrandEmailTheme> {
  try {
    const identity = await resolveBrandIdentity();
    return {
      appName: identity.displayName || DEFAULT_THEME.appName,
      logoUrl: identity.logoUrl ?? undefined,
      accentColor: DEFAULT_THEME.accentColor,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export type SendBrandedEmailResult = { ok: boolean; id?: string; error?: string };

export type SendBrandedEmailDeps = {
  send?: (apiKey: string, payload: ResendEmailPayload) => Promise<{ id: string }>;
  apiKey?: string;
  from?: string;
};

export async function sendBrandedEmail(
  input: {
    to: string | string[];
    subject: string;
    heading: string;
    bodyBlocks: string[];
    cta?: EmailCta;
    theme: BrandEmailTheme;
    footerNote?: string;
  },
  deps: SendBrandedEmailDeps = {},
): Promise<SendBrandedEmailResult> {
  const apiKey = deps.apiKey ?? process.env.RESEND_API_KEY;
  const from = deps.from ?? process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return { ok: false, error: "Resend isn't configured (RESEND_API_KEY / RESEND_FROM)." };
  }

  const send = deps.send ?? sendResendEmail;
  const { html, text } = renderBrandedEmail({
    heading: input.heading,
    bodyBlocks: input.bodyBlocks,
    cta: input.cta,
    theme: input.theme,
    footerNote: input.footerNote,
  });

  try {
    const payload = buildResendEmailPayload({ from, to: input.to, subject: input.subject, html, text });
    const { id } = await send(apiKey, payload);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Resend send failed." };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/email/index.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/index.ts src/lib/email/index.test.ts
git commit -m "feat(email): branded send wrapper + per-org theme resolution"
```

---

## Task 3: Switch invites to in-app branded send

**Files:**
- Modify: `src/app/api/auth/workspace-invites/route.ts:33-49`
- Test: `src/app/api/auth/workspace-invites/route.test.ts`

- [ ] **Step 1: Update the test to the new send path**

Replace the body of `src/app/api/auth/workspace-invites/route.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/workspace-invites", () => ({ issueWorkspaceInviteCode: vi.fn(), cancelWorkspaceInvite: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/email", () => ({ resolveBrandEmailTheme: vi.fn(), sendBrandedEmail: vi.fn() }));
import { issueWorkspaceInviteCode } from "@/lib/auth/workspace-invites";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveBrandEmailTheme, sendBrandedEmail } from "@/lib/email";
import { POST } from "./route";

const issue = vi.mocked(issueWorkspaceInviteCode);
const adminFor = vi.mocked(getSupabaseAdminClient);
const theme = vi.mocked(resolveBrandEmailTheme);
const send = vi.mocked(sendBrandedEmail);
const generateLink = vi.fn();

function req(body: unknown) {
  return new Request("https://app.example.com/api/auth/workspace-invites", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  issue.mockReset(); generateLink.mockReset(); theme.mockReset(); send.mockReset();
  issue.mockResolvedValue({ ok: true, code: "ABC123", expiresAt: "2026-07-01T00:00:00Z" } as never);
  generateLink.mockResolvedValue({ data: { properties: { action_link: "https://app.example.com/auth/confirm?token_hash=t&type=invite" } }, error: null });
  adminFor.mockReturnValue({ auth: { admin: { generateLink } } } as never);
  theme.mockResolvedValue({ appName: "Summit", accentColor: "#0B0B0C" });
  send.mockResolvedValue({ ok: true, id: "msg_1" });
});

describe("POST /api/auth/workspace-invites email send", () => {
  it("generates an invite link and sends a branded email when invitedEmail is given", async () => {
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "teammate@co.com" }));
    expect(generateLink).toHaveBeenCalledWith({
      type: "invite",
      email: "teammate@co.com",
      options: { redirectTo: "https://app.example.com/auth/confirm", data: { pending_invite_code: "ABC123" } },
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: "teammate@co.com",
      cta: { label: "Accept invitation", url: "https://app.example.com/auth/confirm?token_hash=t&type=invite" },
    }));
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: true });
  });

  it("does NOT email when no invitedEmail (code-only)", async () => {
    const res = await POST(req({ workspaceId: "w1", role: "member" }));
    expect(generateLink).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123" });
  });

  it("returns ok+code with emailed:false when link generation errors", async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: "already registered" } });
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "dup@co.com" }));
    expect(res.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: false, emailError: "already registered" });
  });

  it("returns ok+code with emailed:false when the branded send fails", async () => {
    send.mockResolvedValue({ ok: false, error: "Resend 422" });
    const res = await POST(req({ workspaceId: "w1", role: "member", invitedEmail: "x@co.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, code: "ABC123", emailed: false, emailError: "Resend 422" });
  });

  it("does not email when issuing the code failed", async () => {
    issue.mockResolvedValue({ ok: false, status: "invalid_input", message: "bad" } as never);
    const res = await POST(req({ workspaceId: "", role: "member", invitedEmail: "x@co.com" }));
    expect(res.status).toBe(400);
    expect(generateLink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/auth/workspace-invites/route.test.ts`
Expected: FAIL — route still calls `inviteUserByEmail`; `generateLink` / `sendBrandedEmail` not invoked.

- [ ] **Step 3: Update the route**

In `src/app/api/auth/workspace-invites/route.ts`, add imports at the top:

```ts
import { resolveBrandEmailTheme, sendBrandedEmail } from "@/lib/email";
```

Replace the `if (invitedEmail) { ... }` block (currently lines 33-49) with:

```ts
  const invitedEmail = typeof body.invitedEmail === "string" ? body.invitedEmail.trim() : "";
  if (invitedEmail) {
    const origin = new URL(request.url).origin;
    try {
      const { data, error } = await getSupabaseAdminClient().auth.admin.generateLink({
        type: "invite",
        email: invitedEmail,
        options: { redirectTo: `${origin}/auth/confirm`, data: { pending_invite_code: result.code } },
      });
      const actionLink = data?.properties?.action_link;
      if (error || !actionLink) {
        return NextResponse.json({
          ...result,
          emailed: false,
          emailError: error?.message ?? "Could not generate the invite link.",
        });
      }
      const theme = await resolveBrandEmailTheme();
      const sent = await sendBrandedEmail({
        to: invitedEmail,
        subject: `You're invited to ${theme.appName}`,
        heading: `Join ${theme.appName}`,
        bodyBlocks: [
          `You've been invited to collaborate in ${theme.appName}.`,
          "Click below to accept your invitation and finish setting up your account.",
        ],
        cta: { label: "Accept invitation", url: actionLink },
        theme,
      });
      return NextResponse.json({ ...result, emailed: sent.ok, emailError: sent.ok ? null : sent.error ?? null });
    } catch (error) {
      return NextResponse.json({
        ...result,
        emailed: false,
        emailError: error instanceof Error ? error.message : "Invite email could not be sent.",
      });
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/auth/workspace-invites/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck the touched surface**

Run: `pnpm build` (or `npx tsc --noEmit`)
Expected: no type errors. `generateLink`'s result type exposes `data.properties.action_link` on the Supabase admin client.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/workspace-invites/route.ts src/app/api/auth/workspace-invites/route.test.ts
git commit -m "feat(invites): send branded invite via Resend, generateLink instead of Supabase send"
```

---

## Task 4: Hosted-template export script

**Files:**
- Create: `scripts/export-auth-templates.ts`
- Modify: `package.json` (add `tsx` devDependency + `email:export` script)

- [ ] **Step 1: Add the dev dependency + script**

Run: `pnpm add -D tsx`

Then in `package.json` `scripts`, add:

```json
"email:export": "tsx scripts/export-auth-templates.ts"
```

- [ ] **Step 2: Write the export script**

Create `scripts/export-auth-templates.ts`:

```ts
// Renders the shared brand shell with Supabase Go-template placeholders so the
// hosted auth templates (magic link / recovery / signup confirm) stay in sync
// with the repo. Run `pnpm email:export`, then paste each file into the matching
// Supabase dashboard editor (Authentication -> Email Templates).
//
// Placeholders ({{ .ConfirmationURL }}, {{ .SiteURL }}) contain no HTML-escapable
// characters, so they survive the renderer's escaping unchanged.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderBrandedEmail, type BrandEmailTheme } from "../src/domain/email-templates";

const APP_NAME = process.env.EMAIL_EXPORT_APP_NAME?.trim() || "Arc";
const LOGO_URL = process.env.EMAIL_EXPORT_LOGO_URL?.trim() || undefined;
const theme: BrandEmailTheme = { appName: APP_NAME, logoUrl: LOGO_URL, accentColor: "#0B0B0C" };

const templates: Record<string, { heading: string; bodyBlocks: string[]; cta: { label: string } }> = {
  "magic-link": {
    heading: `Sign in to ${APP_NAME}`,
    bodyBlocks: ["Use the button below to sign in. This link expires shortly and can only be used once."],
    cta: { label: "Sign in" },
  },
  recovery: {
    heading: "Reset your password",
    bodyBlocks: ["We received a request to reset your password. If that wasn't you, you can ignore this email."],
    cta: { label: "Reset password" },
  },
  "signup-confirm": {
    heading: `Confirm your email`,
    bodyBlocks: [`Confirm your address to finish creating your ${APP_NAME} account.`],
    cta: { label: "Confirm email" },
  },
};

const outDir = resolve(process.cwd(), "docs/email-templates");
mkdirSync(outDir, { recursive: true });

for (const [name, t] of Object.entries(templates)) {
  const { html } = renderBrandedEmail({
    heading: t.heading,
    bodyBlocks: t.bodyBlocks,
    cta: { label: t.cta.label, url: "{{ .ConfirmationURL }}" },
    theme,
    footerNote: `Sent by ${APP_NAME}. If you didn't expect this email, you can safely ignore it.`,
  });
  const file = resolve(outDir, `${name}.html`);
  writeFileSync(file, html, "utf8");
  console.log(`wrote ${file}`);
}
```

- [ ] **Step 3: Run the script and verify output**

Run: `pnpm email:export`
Expected: prints three `wrote .../docs/email-templates/<name>.html` lines; each file contains `href="{{ .ConfirmationURL }}"` and the heading text.

- [ ] **Step 4: Commit**

```bash
git add scripts/export-auth-templates.ts package.json pnpm-lock.yaml docs/email-templates
git commit -m "feat(email): export branded hosted auth templates with Go placeholders"
```

---

## Task 5: Env example + runbook (config matrix, Cloud Run rule)

**Files:**
- Modify: `.env.example:86-91`
- Modify: `docs/runbooks/email-invites-setup.md`

- [ ] **Step 1: Clarify `RESEND_FROM` in `.env.example`**

Replace the Resend block (`.env.example:86-91`) with:

```bash
# Resend email. Without RESEND_API_KEY the Connections panel shows Resend as
# "not configured" and every send is blocked. RESEND_FROM MUST be an address on a
# domain you've verified in Resend (DKIM/SPF/DMARC), e.g. "Arc <hello@yourdomain.com>";
# it is the branded from-address for invites and other transactional sends.
# NOTE: these belong on Vercel + local only. Do NOT set RESEND_* on the Cloud Run
# runner — the runner sends no email; the app performs every Resend send.
RESEND_API_KEY=
RESEND_FROM=
```

- [ ] **Step 2: Add the config matrix + Cloud Run note + export step to the runbook**

In `docs/runbooks/email-invites-setup.md`, after section "## 2. Custom SMTP (Resend) for Reliable Delivery", insert a new section:

```markdown
## 2a. Where each setting lives (config matrix)

| Setting | Vercel (app) | local `.env.local` | Supabase dashboard | Cloud Run (runner) |
|---|---|---|---|---|
| `RESEND_API_KEY` | yes | yes | — | NO — runner sends no email |
| `RESEND_FROM` (branded, on the verified domain) | yes | yes | — | NO |
| Custom SMTP (`smtp.resend.com`, user `resend`, pass = Resend key, sender = branded addr) | — | — | yes (Auth -> SMTP) | — |
| Site URL + Redirect URLs (`/auth/confirm`, `/auth/callback`) | — | — | yes (Auth -> URL Config) | — |
| DKIM / SPF / DMARC | — | — | — (DNS / registrar) | — |

**Cloud Run runner — verify, don't change.** The runner (`apps/arc-runner`) reads no
Resend vars and needs no change for email. Only confirm its shared Arc secrets still
match Vercel:

\`\`\`bash
gcloud run services describe arc-runner --region us-central1 \
  --format='value(spec.template.spec.containers[0].env)'
\`\`\`

`APP_API_BASE_URL` should point at the prod app; `ARC_AGENT_API_TOKEN` and
`ARC_WEBHOOK_SECRET` (Secret Manager) must resolve to the same values Vercel holds.
Do not add `RESEND_*` here.

## 2b. Branded invite emails (in-app)

Invites are no longer sent by Supabase. `POST /api/auth/workspace-invites` calls
`auth.admin.generateLink({ type: 'invite' })` to mint the action link WITHOUT sending,
then renders the branded invite (shared shell in `src/domain/email-templates.ts`) and
sends it via Resend with `RESEND_FROM`. The code-only fallback is unchanged: any link or
send failure still returns `ok:true` with the shareable `code` and `emailed:false`.

## 2c. Branded hosted templates (magic link / recovery / signup confirm)

These remain Supabase-sent. Run `pnpm email:export` to regenerate
`docs/email-templates/*.html` from the same brand shell, then paste each into its
Supabase dashboard editor (Authentication -> Email Templates). Re-run + re-paste when the
shell changes.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/runbooks/email-invites-setup.md
git commit -m "docs(email): config matrix, Cloud-Run no-email rule, invite + export steps"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the full affected test surface**

Run: `pnpm test src/domain/__tests__/email-templates.test.ts src/lib/email/index.test.ts src/app/api/auth/workspace-invites/route.test.ts`
Expected: all green.

- [ ] **Step 2: Lint the changed files**

Run: `pnpm lint` scoped to the changed files (per repo convention, eslint over the whole tree reports vendored noise).
Expected: no new errors in the files this plan created/modified.

- [ ] **Step 3: Typecheck**

Run: `pnpm build` (or `npx tsc --noEmit`)
Expected: no type errors.

- [ ] **Step 4: Final commit (if lint/types needed touch-ups)**

```bash
git add -A
git commit -m "chore(email): lint + type fixes for branded transactional email"
```

---

## Notes for the implementer

- **No outbound without approval:** this changes only how the *invite* (an operator-triggered, already-gated action) renders/sends. It adds no automatic outbound. Campaign sends stay behind `ENABLE_CAMPAIGN_SEND` and are untouched.
- **Don't touch the runner:** `apps/arc-runner` is out of scope. The only runner interaction is the read-only `gcloud run services describe` verification in the runbook.
- **Phase 2 (not in this plan):** the Supabase Send Email Hook (`/api/auth/email-hook` + `AUTH_EMAIL_HOOK_SECRET`) would render *all* auth emails from this same shell and remove Task 4's copy-paste. Still app+dashboard only — never Cloud Run.
```
