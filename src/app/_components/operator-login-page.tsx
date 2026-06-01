import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { buttonClasses } from "./page-header";
import {
  OPERATOR_COOKIE,
  getSafeOperatorReturnPath,
  isOperatorGateEnabled,
  isValidOperatorValue,
} from "@/lib/auth/operator-shared";

type LoginSearchParams = {
  from?: string;
  error?: string;
};

export async function getOperatorLoginProps(searchParams?: Promise<LoginSearchParams>) {
  const query = searchParams ? await searchParams : {};
  const from = getSafeOperatorReturnPath(query.from);

  if (!isOperatorGateEnabled()) {
    redirect(from);
  }

  const store = await cookies();

  if (isValidOperatorValue(store.get(OPERATOR_COOKIE)?.value)) {
    redirect(from);
  }

  return {
    from,
    hasError: Boolean(query.error),
  };
}

export function OperatorLoginPage({ from, hasError }: { from: string; hasError: boolean }) {
  const errorMessage = hasError ? "That email or password was not accepted. Try again." : null;

  return (
    <main className="chicago-dark relative flex min-h-[100dvh] overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      <Image
        alt=""
        aria-hidden="true"
        className="object-cover"
        fill
        priority
        sizes="100vw"
        src="/brand/login-background.png"
      />
      <div className="absolute inset-0 bg-[oklch(0.08_0.024_250/0.72)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(0deg,var(--canvas)_0%,transparent_100%)]" />

      <div className="relative z-10 flex min-h-[100dvh] w-full items-center justify-center px-5 py-8">
        <section className="w-full max-w-[430px] rounded-xl border border-[var(--border-panel)] bg-[oklch(0.12_0.03_250/0.92)] p-6 shadow-[0_28px_80px_-52px_oklch(0.74_0.115_232)] backdrop-blur-xl sm:p-8">
          <div className="flex justify-center">
            <Image
              alt="Big Shoulders Restoration M&P"
              className="h-auto w-40 object-contain"
              height={938}
              priority
              src="/brand/big-shoulders-mp-logo-transparent.png"
              width={1057}
            />
          </div>

          <div className="mt-7 text-center">
            <h1 className="font-display text-[1.8rem] font-black leading-tight tracking-[-0.04em] text-[var(--text-primary)]">
              Sign in
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Enter your operator email and password to open the Growth Engine.
            </p>
          </div>

          <form method="post" action="/api/auth/sign-in" className="mt-6 space-y-4">
            <input type="hidden" name="from" value={from} />
            <label className="block">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Email</span>
              <input
                autoComplete="username"
                autoFocus
                required
                name="email"
                type="email"
                placeholder="operator@example.com"
                className="mt-2 h-12 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[oklch(0.74_0.115_232/0.18)]"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Password</span>
              <input
                autoComplete="current-password"
                required
                name="password"
                type="password"
                placeholder="Enter password"
                className="mt-2 h-12 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[oklch(0.74_0.115_232/0.18)]"
              />
            </label>
            {errorMessage ? (
              <p className="rounded-lg border border-[oklch(0.68_0.2_26/0.42)] bg-[oklch(0.68_0.2_26/0.16)] px-3 py-2 text-sm text-[oklch(0.86_0.09_26)]">
                {errorMessage}
              </p>
            ) : null}
            <button type="submit" className={buttonClasses({ variant: "primary", className: "w-full" })}>
              Sign in
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
