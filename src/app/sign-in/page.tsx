import Image from "next/image";

import { buttonClasses } from "../_components/page-header";

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; error?: string }>;
}) {
  const query = searchParams ? await searchParams : {};
  const from = typeof query.from === "string" && query.from.startsWith("/") ? query.from : "/";

  return (
    <main className="chicago-dark flex min-h-screen items-center justify-center px-4 py-16">
      <div className="signal-panel w-full max-w-sm p-7">
        <div className="flex items-center gap-3">
          <span className="signal-radar relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <Image
              alt=""
              aria-hidden="true"
              className="h-full w-full object-contain drop-shadow-[0_0_14px_oklch(0.74_0.115_232/0.34)]"
              height={88}
              src="/brand/signal-mark-transparent.png"
              width={88}
            />
          </span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--priority-bright)]">Big Shoulders</div>
            <div className="font-display text-2xl font-extrabold leading-none tracking-[-0.05em] text-[var(--text-primary)]">Signal</div>
          </div>
        </div>

        <h1 className="mt-6 font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Operator sign-in</h1>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
          This console is access-controlled. Enter the operator access token to continue.
        </p>

        <form method="post" action="/api/auth/sign-in" className="mt-6 space-y-3">
          <input type="hidden" name="from" value={from} />
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Access token</span>
            <input
              autoFocus
              required
              name="token"
              type="password"
              placeholder="Operator access token"
              className="mt-2 h-11 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
            />
          </label>
          {query.error ? (
            <p className="rounded-md border border-[oklch(0.68_0.2_26/0.42)] bg-[oklch(0.68_0.2_26/0.16)] px-3 py-2 text-sm text-[oklch(0.86_0.09_26)]">
              That token was not accepted. Try again.
            </p>
          ) : null}
          <button type="submit" className={buttonClasses({ variant: "primary", className: "w-full" })}>
            Enter console
          </button>
        </form>
      </div>
    </main>
  );
}
