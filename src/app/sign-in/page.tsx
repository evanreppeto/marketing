import Image from "next/image";
import Link from "next/link";

import { buttonClasses } from "../_components/page-header";

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; error?: string }>;
}) {
  const query = searchParams ? await searchParams : {};
  const from = typeof query.from === "string" && query.from.startsWith("/") ? query.from : "/";

  return (
    <main className="chicago-dark relative flex min-h-screen overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      <Image
        alt=""
        aria-hidden="true"
        className="object-cover"
        fill
        priority
        sizes="100vw"
        src="/brand/login-background.png"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(0.09_0.025_250/0.74)_0%,oklch(0.09_0.025_250/0.5)_44%,oklch(0.07_0.02_250/0.82)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_48%,oklch(0.74_0.115_232/0.11),transparent_34%)]" />

      <div className="relative z-10 grid min-h-screen w-full items-center gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:px-12 xl:px-16">
        <section className="hidden max-w-2xl lg:block">
          <div className="inline-flex rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-1 text-xs font-semibold text-[var(--chicago-blue-soft)]">
            Big Shoulders Restoration M&P
          </div>
          <h1 className="mt-6 max-w-xl font-display text-[clamp(2.6rem,5vw,5rem)] font-black leading-[0.95] tracking-[-0.055em]">
            Operator access for growth work.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-[var(--text-secondary)]">
            Review prepared leads, campaigns, personas, and approvals from one controlled console.
          </p>
          <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">
            {["Human approval", "Outbound locked", "CRM memory"].map((item) => (
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[oklch(0.12_0.03_250/0.72)] px-3 py-3" key={item}>
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                <div className="mt-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">{item}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-2xl border border-[var(--border-panel)] bg-[oklch(0.12_0.03_250/0.9)] p-6 shadow-[0_32px_90px_-50px_oklch(0.74_0.115_232)] backdrop-blur-xl sm:p-8">
          <div className="flex justify-center">
            <Image
              alt="Big Shoulders Restoration M&P"
              className="h-auto w-44 object-contain"
              height={938}
              priority
              src="/brand/big-shoulders-mp-logo-transparent.png"
              width={1057}
            />
          </div>

          <div className="mt-8 text-center">
            <h2 className="font-display text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Sign in to the console</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Enter the operator access token to continue.</p>
          </div>

          <form method="post" action="/api/auth/sign-in" className="mt-7 space-y-4">
            <input type="hidden" name="from" value={from} />
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Access token</span>
              <input
                autoComplete="current-password"
                autoFocus
                required
                name="token"
                type="password"
                placeholder="Enter operator token"
                className="mt-2 h-12 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[oklch(0.74_0.115_232/0.18)]"
              />
            </label>
            {query.error ? (
              <p className="rounded-lg border border-[oklch(0.68_0.2_26/0.42)] bg-[oklch(0.68_0.2_26/0.16)] px-3 py-2 text-sm text-[oklch(0.86_0.09_26)]">
                That token was not accepted. Try again.
              </p>
            ) : null}
            <button type="submit" className={buttonClasses({ variant: "primary", className: "w-full" })}>
              Sign in
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Access policy</span>
              <span className="rounded-full border border-[oklch(0.82_0.13_85/0.35)] bg-[oklch(0.82_0.13_85/0.12)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[oklch(0.9_0.09_85)]">
                Approval first
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
              Mark can draft and prepare. Sending, publishing, spending, or contacting stays locked behind human approval.
            </p>
          </div>

          <div className="mt-5 text-center text-xs text-[var(--text-muted)]">
            Need the app open locally? <Link className="font-semibold text-[var(--accent)] transition hover:text-[var(--accent-strong)]" href="/">Return home</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
