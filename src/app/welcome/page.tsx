import Link from "next/link";

import { AuthBrandPanel } from "@/components/ui/auth-brand-panel";
import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

export const metadata = { title: "Welcome — Arc" };

// Landing page for a freshly-accepted invite. `authedRedirectLocation` routes
// `invited_member` here after the session + membership are established, so by the
// time this renders the user is already in the workspace — this is the warm
// confirmation before they continue into the app.
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const destination = getSafeOperatorReturnPath(params.from ?? "/home");
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const workspaceName = ctx?.orgName?.trim() || "your workspace";

  return (
    <main className="min-h-screen w-full bg-[var(--canvas)] text-[var(--text-primary)] lg:grid lg:grid-cols-[1fr_1.05fr]">
      <AuthBrandPanel
        headline="You're in."
        subline="Your teammate's workspace is ready for you — every draft still waits for a human approval before anything goes out."
      />

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[27rem]">
          <div className="mb-9 lg:hidden">
            <img src="/icon.png" alt="Arc" className="h-8 w-auto" />
          </div>

          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--ok)_12%,transparent)]">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--ok)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5L20 7" />
            </svg>
          </span>

          <h2 className="mt-6 font-[family-name:var(--font-display)] text-[1.6rem] font-semibold leading-tight text-[var(--text-primary)]">
            Welcome to {workspaceName}
          </h2>
          <p className="mt-2 text-[0.925rem] leading-relaxed text-[var(--text-secondary)]">
            You&apos;ve joined the team. Everything Arc prepares lands in your queue for review — nothing reaches a
            customer until someone approves it.
          </p>

          <Link
            href={destination}
            className="mt-8 flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-[0.9375rem] font-semibold text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[color:color-mix(in_srgb,var(--accent)_92%,white)] active:translate-y-px"
          >
            Enter workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
