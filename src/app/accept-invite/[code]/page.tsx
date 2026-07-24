import Link from "next/link";

import { AuthBrandPanel } from "@/components/ui/auth-brand-panel";
import { PasswordField } from "@/components/ui/password-field";
import { lookupWorkspaceInviteByCode } from "@/lib/auth/workspace-invites";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

import { redeemInviteAction } from "./actions";

export const metadata = { title: "Accept invite — Arc Studio" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  marketer: "Marketer",
  reviewer: "Reviewer",
  member: "Member",
  viewer: "Viewer",
};

const INVALID_COPY: Record<string, { title: string; body: string }> = {
  not_found: { title: "This invite link isn't valid", body: "The code may be mistyped, or the invite was never created. Ask your teammate to send you a fresh link." },
  expired: { title: "This invite has expired", body: "Invites are good for a limited time. Ask your teammate to send you a new one — it only takes a moment." },
  used: { title: "This invite has already been used", body: "If that was you, just sign in. Otherwise ask for a fresh invite." },
  revoked: { title: "This invite was cancelled", body: "The workspace admin revoked this invite. Ask them to send a new one if you still need access." },
  not_configured: { title: "Invites aren't available right now", body: "Something isn't set up on our side yet. Try again shortly." },
};

const REDEEM_ERROR: Record<string, string> = {
  email_mismatch: "This invite was sent to a different email. Sign in with that address, or ask for an invite to your email.",
  expired: "This invite expired before it could be accepted. Ask your teammate for a new one.",
  not_found: "We couldn't find that invite anymore. Ask for a fresh link.",
  missing_email: "Your account is missing an email address. Contact support.",
  not_configured: "Invites aren't available right now. Try again shortly.",
  failed: "We couldn't complete the join. Try again.",
};

const labelClass = "block text-[0.8125rem] font-medium text-[var(--text-secondary)] mb-1.5";
const inputClass =
  "w-full min-h-[44px] rounded-lg bg-[var(--surface-inset)] border border-[color:var(--border-panel)] px-3.5 text-[0.9375rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[color:var(--accent)] focus:bg-[var(--surface-panel)]";
const primaryBtn =
  "mt-2 flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-[0.9375rem] font-semibold text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[color:color-mix(in_srgb,var(--accent)_92%,white)] active:translate-y-px";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen w-full bg-[var(--canvas)] text-[var(--text-primary)] lg:grid lg:grid-cols-[1fr_1.05fr]">
      <AuthBrandPanel
        headline="Join your team."
        subline="You've been invited into a workspace on Arc — where marketing gets drafted for you and every send waits on a human's approval."
      />
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[27rem]">
          <div className="mb-9 lg:hidden">
            <img src="/icon.png" alt="Arc" className="h-8 w-auto" />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const invite = await lookupWorkspaceInviteByCode(code);
  const user = await getSupabaseAuthenticatedUser().catch(() => null);

  // Invalid / expired / used invite — a clear dead-end with a way forward.
  if (!invite.ok) {
    const copy = INVALID_COPY[invite.reason] ?? INVALID_COPY.not_found;
    return (
      <Shell>
        <h2 className="font-[family-name:var(--font-display)] text-[1.6rem] font-semibold leading-tight text-[var(--text-primary)]">
          {copy.title}
        </h2>
        <p className="mt-2 text-[0.925rem] leading-relaxed text-[var(--text-secondary)]">{copy.body}</p>
        <Link href="/login" className="mt-8 inline-flex items-center gap-1.5 text-[0.9rem] font-medium text-[var(--accent)] underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </Shell>
    );
  }

  const roleLabel = ROLE_LABEL[invite.role] ?? "Member";
  const error = sp.error ? REDEEM_ERROR[sp.error] ?? "Something went wrong. Try again." : null;
  const emailMismatch = Boolean(invite.invitedEmail && user?.email && invite.invitedEmail !== user.email.toLowerCase());

  return (
    <Shell>
      <p className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.14em] text-[var(--accent)]">
        You&apos;re invited
      </p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-[1.6rem] font-semibold leading-tight text-[var(--text-primary)]">
        Join {invite.workspaceName}
      </h2>
      <p className="mt-2 text-[0.925rem] leading-relaxed text-[var(--text-secondary)]">
        {invite.inviterName ? `${invite.inviterName} invited you` : "You've been invited"} to join as a{" "}
        <span className="font-medium text-[var(--text-primary)]">{roleLabel}</span>.
      </p>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-[color:color-mix(in_srgb,var(--priority)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--priority)_12%,transparent)] px-3.5 py-2.5 text-[0.85rem] text-[var(--text-primary)]">
          {error}
        </p>
      ) : null}

      {user ? (
        // Signed in — one tap to accept.
        <div className="mt-7">
          {emailMismatch ? (
            <p className="mb-4 rounded-lg border border-[color:color-mix(in_srgb,var(--priority)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--priority)_10%,transparent)] px-3.5 py-2.5 text-[0.85rem] text-[var(--text-secondary)]">
              This invite was sent to <span className="font-medium text-[var(--text-primary)]">{invite.invitedEmail}</span>, but you&apos;re
              signed in as <span className="font-medium text-[var(--text-primary)]">{user.email}</span>.
            </p>
          ) : null}
          <form action={redeemInviteAction}>
            <input type="hidden" name="code" value={code} />
            <button type="submit" className={primaryBtn}>
              Join {invite.workspaceName}
            </button>
          </form>
          <p className="mt-4 text-[0.85rem] text-[var(--text-secondary)]">
            Signed in as {user.email}.{" "}
            <span className="inline-flex">
              <form action="/api/auth/sign-out" method="post">
                <button type="submit" className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
                  Use a different account
                </button>
              </form>
            </span>
          </p>
        </div>
      ) : (
        // Signed out — create an account that lands directly in this workspace.
        <>
          <form action="/api/auth/sign-up" method="post" className="mt-7 space-y-4">
            <input type="hidden" name="workspaceIntent" value="join" />
            <input type="hidden" name="inviteCode" value={code} />
            <input type="hidden" name="from" value="/home" />

            <div>
              <label htmlFor="fullName" className={labelClass}>Your name</label>
              <input id="fullName" name="fullName" autoComplete="name" required placeholder="Jordan Vega" className={inputClass} />
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>Work email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={invite.invitedEmail ?? undefined}
                readOnly={Boolean(invite.invitedEmail)}
                placeholder="you@company.com"
                className={`${inputClass}${invite.invitedEmail ? " text-[var(--text-secondary)] cursor-not-allowed" : ""}`}
              />
              {invite.invitedEmail ? (
                <p className="mt-1.5 text-[0.75rem] text-[var(--text-muted)]">This invite is tied to {invite.invitedEmail}.</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>Password</label>
              <PasswordField id="password" name="password" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" className={inputClass} />
            </div>

            <button type="submit" className={primaryBtn}>Create account &amp; join</button>
          </form>

          <p className="mt-6 text-[0.875rem] text-[var(--text-secondary)]">
            Already have an account?{" "}
            <Link href={`/login?from=${encodeURIComponent(`/accept-invite/${code}`)}`} className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
              Sign in to join
            </Link>
          </p>
        </>
      )}
    </Shell>
  );
}
