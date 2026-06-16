import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { buttonClasses } from "./page-header";
import {
  OPERATOR_COOKIE,
  getSafeOperatorReturnPath,
  isOperatorGateEnabled,
  isValidOperatorValue,
} from "@/lib/auth/operator-shared";
import { getAppSettings, getSupportContactEmail } from "@/lib/settings/store";

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
    error: query.error,
  };
}

export async function getOperatorForgotPasswordProps() {
  if (!isOperatorGateEnabled()) {
    redirect("/");
  }

  const store = await cookies();

  if (isValidOperatorValue(store.get(OPERATOR_COOKIE)?.value)) {
    redirect("/");
  }

  return {
    supportEmail: getSupportContactEmail(await getAppSettings()),
  };
}

export function OperatorLoginPage({ from, error }: { from: string; error?: string }) {
  const errorMessage =
    error === "passkey"
      ? "Passkey sign-in is not configured for this console yet."
      : error
        ? "That email or password was not accepted. Try again."
        : null;

  return (
    <OperatorAuthSurface>
      <LogoArc widthClassName="w-40" />

      <div className="mt-7 text-center">
        <h1 className="font-display text-[1.8rem] font-bold leading-tight tracking-[-0.04em] text-[var(--text-primary)]">
          Sign in
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Enter your operator email and password to open Arc.
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
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Password</span>
            <Link className="text-xs font-semibold text-[var(--accent)] transition hover:text-[var(--accent-strong)]" href="/forgot-password">
              Forgot password?
            </Link>
          </span>
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

      <form method="post" action="/api/auth/sign-in/passkey" className="mt-3">
        <input type="hidden" name="from" value={from} />
        <button type="submit" className={buttonClasses({ variant: "ghost", className: "w-full" })}>
          <span>or sign in with passkey</span>
          <svg aria-hidden="true" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24">
            <path
              d="M8.2 10.35a3.65 3.65 0 1 0 0-7.3 3.65 3.65 0 0 0 0 7.3Z"
              fill="currentColor"
            />
            <path
              d="M2.75 17.85c.48-3.48 2.67-5.6 5.45-5.6 2.06 0 3.79 1.14 4.74 3.04a5.72 5.72 0 0 0-1.21 3.56H3.83c-.67 0-1.17-.39-1.08-1Z"
              fill="currentColor"
            />
            <circle cx="16.9" cy="15.55" r="2.35" stroke="currentColor" strokeWidth="1.7" />
            <path d="M19.25 15.55h3m-1 0v2m-2.05 0h1.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          </svg>
        </button>
      </form>
    </OperatorAuthSurface>
  );
}

export function OperatorForgotPasswordPage({ supportEmail }: { supportEmail: string }) {
  const supportHref = `mailto:${supportEmail}?subject=${encodeURIComponent("Arc password reset")}`;

  return (
    <OperatorAuthSurface>
      <LogoArc widthClassName="w-36" />

      <div className="mt-7 text-center">
        <h1 className="font-display text-[1.8rem] font-bold leading-tight tracking-[-0.04em] text-[var(--text-primary)]">
          Reset access
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Operator passwords are managed by the app administrator.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
        Send a reset request to <span className="font-semibold text-[var(--text-primary)]">{supportEmail}</span>. The administrator can
        update your operator credentials and confirm when access is ready.
      </div>

      <div className="mt-5 grid gap-3">
        <Link className={buttonClasses({ variant: "primary", className: "w-full" })} href={supportHref}>
          Request reset
        </Link>
        <Link className={buttonClasses({ variant: "ghost", className: "w-full" })} href="/login">
          Back to sign in
        </Link>
      </div>
    </OperatorAuthSurface>
  );
}

function LogoArc({ widthClassName }: { widthClassName: string }) {
  return (
    <div className="flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- brand mark served from /public. */}
      <img alt="Arc" className={`h-auto rounded-2xl object-contain ${widthClassName}`} src="/brand/arc-logo.png" />
    </div>
  );
}

function OperatorAuthSurface({ children }: { children: React.ReactNode }) {
  return (
    <main className="chicago-dark relative flex min-h-[100dvh] overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      <Image
        alt=""
        aria-hidden="true"
        className="object-cover"
        fill
        priority
        sizes="100vw"
        src="/brand/login-background-v2.png"
      />
      <div className="absolute inset-0 bg-[oklch(0.07_0.022_250/0.64)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(0deg,var(--canvas)_0%,transparent_100%)]" />

      <div className="relative z-10 flex min-h-[100dvh] w-full items-center justify-center px-5 py-8">
        <section className="w-full max-w-[430px] rounded-xl border border-[var(--border-panel)] bg-[oklch(0.105_0.026_250/0.72)] p-6 shadow-[0_28px_80px_-52px_oklch(0.74_0.115_232)] backdrop-blur-md sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}
