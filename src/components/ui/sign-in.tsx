"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserPlus } from "lucide-react";
import React, { useState } from "react";
import { useFormStatus } from "react-dom";

import { EtheralShadow } from "./etheral-shadow";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 48 48">
      <path d="M43.61 20.08H42V20H24v8h11.3c-1.65 4.66-6.08 8-11.3 8-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92Z" fill="#FFC107" />
      <path d="M6.31 14.69l6.57 4.82C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4c-7.68 0-14.34 4.34-17.69 10.69Z" fill="#FF3D00" />
      <path d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24C29.21 35.09 26.72 36 24 36c-5.2 0-9.62-3.32-11.28-7.95L6.2 33.08C9.5 39.56 16.23 44 24 44Z" fill="#4CAF50" />
      <path d="M43.61 20.08H42V20H24v8h11.3a12.05 12.05 0 0 1-4.09 5.57l6.19 5.24C36.97 39.2 44 34 44 24c0-1.34-.14-2.65-.39-3.92Z" fill="#1976D2" />
    </svg>
  );
}

type SignInPageProps = {
  from: string;
  errorMessage?: string | null;
  authLabel: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  forgotPasswordHref?: string;
  showSignUpLink?: boolean;
  showSocialAuth?: boolean;
};

type AuthPageFrameProps = {
  children: React.ReactNode;
  rightTitle?: string;
  rightSteps?: string[];
};

function AuthPageFrame({
  children,
  rightSteps,
  rightTitle = "Approval-safe campaign operations, protected at the front door.",
}: AuthPageFrameProps) {
  return (
    <main className="chicago-dark grid min-h-[100dvh] overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)] md:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
      <section className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-[430px]">{children}</div>
      </section>

      <section className="relative hidden min-h-[100dvh] p-4 md:block">
        <div className="auth-panel-reveal absolute inset-4 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[0_32px_90px_-60px_var(--accent)]">
          <EtheralShadow
            accentColor="rgba(241, 237, 226, 0.12)"
            color="rgba(200, 162, 74, 0.7)"
            noise={{ opacity: 0.68, scale: 1.12 }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,16,19,0.08),rgba(16,16,19,0.58))]" />
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="max-w-md">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-contrast)]">
                Arc Marketing Console
              </p>
              <p className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.03em] text-[var(--text-primary)]">
                {rightTitle}
              </p>
              {rightSteps?.length ? (
                <ol className="mt-5 grid gap-3">
                  {rightSteps.map((step, index) => (
                    <li className="flex items-center gap-3 text-sm text-[var(--text-secondary)]" key={step}>
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--surface-inset)] text-[11px] font-semibold text-[var(--accent)]">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function SignInPage({
  from,
  errorMessage,
  authLabel,
  title = "Welcome back",
  description = "Sign in to continue managing Arc, campaigns, CRM, and operator approvals.",
  forgotPasswordHref = "/forgot-password",
  showSignUpLink = false,
  showSocialAuth = false,
}: SignInPageProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthPageFrame>
          <div className="animate-auth-element">
            {/* eslint-disable-next-line @next/next/no-img-element -- transparent brand mark served from /public. */}
            <img alt="Arc" className="h-auto w-28 object-contain sm:w-32" src="/brand/arc-mark.png" />
          </div>

          <div className="mt-8 space-y-3 sm:mt-10">
            <p className="animate-auth-element animate-auth-delay-100 font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              {authLabel}
            </p>
            <h1 className="animate-auth-element animate-auth-delay-150 font-serif text-[2.45rem] font-medium leading-[0.98] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[3.45rem]">
              {title}
            </h1>
            <p className="animate-auth-element animate-auth-delay-200 max-w-[34rem] text-sm leading-6 text-[var(--text-secondary)]">
              {description}
            </p>
          </div>

          <form action="/api/auth/sign-in" method="post" className="mt-7 space-y-5 sm:mt-8">
            <input type="hidden" name="from" value={from} />

            <label className="animate-auth-element animate-auth-delay-300 block">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Email address</span>
              <span className="auth-input-shell mt-2 flex h-13 items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_86%,transparent)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition focus-within:border-[var(--accent-border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
                <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <input
                  autoComplete="username"
                  autoFocus
                  required
                  name="email"
                  type="email"
                  placeholder="operator@example.com"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
              </span>
            </label>

            <label className="animate-auth-element animate-auth-delay-400 block">
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Password</span>
                <a className="text-xs font-semibold text-[var(--accent)] transition hover:text-[var(--accent-strong)]" href={forgotPasswordHref}>
                  Forgot password?
                </a>
              </span>
              <span className="auth-input-shell mt-2 flex h-13 items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_86%,transparent)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition focus-within:border-[var(--accent-border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
                <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <input
                  autoComplete="current-password"
                  required
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <div className="animate-auth-element animate-auth-delay-450 flex items-center justify-between gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-3 text-[var(--text-secondary)]">
                <input
                  className="auth-checkbox h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-[var(--border-strong)] bg-[var(--surface-inset)] transition checked:border-[var(--accent)] checked:bg-[var(--accent)]"
                  name="rememberMe"
                  type="checkbox"
                  value="1"
                />
                <span>Remember me</span>
              </label>
            </div>

            {errorMessage ? (
              <p
                aria-live="polite"
                className="animate-auth-element animate-auth-delay-500 rounded-lg border border-[var(--priority-border-soft)] bg-[var(--priority-soft)] px-3 py-2 text-sm leading-5 text-[var(--priority-text)]"
              >
                {errorMessage}
              </p>
            ) : null}

            <PrimarySubmitButton
              className="animate-auth-element animate-auth-delay-600"
              idleIcon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
              idleLabel="Sign in"
              pendingLabel="Signing in"
            />
          </form>

          {showSocialAuth ? (
            <>
              <div className="animate-auth-element animate-auth-delay-700 mt-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">or</span>
                <span className="h-px flex-1 bg-[var(--border-hairline)]" />
              </div>

              <form action="/api/auth/sign-in/google" className="animate-auth-element animate-auth-delay-800 mt-4" method="post">
                <input type="hidden" name="from" value={from} />
                <button
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] active:translate-y-px"
                  type="submit"
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
              </form>
            </>
          ) : null}

          {showSignUpLink ? (
            <p className="animate-auth-element animate-auth-delay-900 mt-6 text-sm leading-6 text-[var(--text-muted)]">
              New here?{" "}
              <a className="font-semibold text-[var(--accent)] transition hover:text-[var(--accent-strong)]" href={`/sign-up?from=${encodeURIComponent(from)}`}>
                Create an account
              </a>
              .
            </p>
          ) : null}
    </AuthPageFrame>
  );
}

type SignUpPageProps = {
  from: string;
  canCreateAccount?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
  showSocialAuth?: boolean;
};

export function SignUpPage({
  from,
  canCreateAccount = true,
  errorMessage,
  showSocialAuth = false,
  successMessage,
}: SignUpPageProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthPageFrame
      rightSteps={["Create your account", "Confirm your work email", "Workspace admin approves access"]}
      rightTitle="Create an operator account, then let your workspace admin approve access."
    >
      <div className="animate-auth-element">
        {/* eslint-disable-next-line @next/next/no-img-element -- transparent brand mark served from /public. */}
        <img alt="Arc" className="h-auto w-28 object-contain sm:w-32" src="/brand/arc-mark.png" />
      </div>

      <div className="mt-8 space-y-3 sm:mt-10">
        <p className="animate-auth-element animate-auth-delay-100 font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          Operator Access
        </p>
        <h1 className="animate-auth-element animate-auth-delay-150 font-serif text-[2.28rem] font-medium leading-[0.98] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[3.2rem]">
          Create your Arc account
        </h1>
        <p className="animate-auth-element animate-auth-delay-200 max-w-[34rem] text-sm leading-6 text-[var(--text-secondary)]">
          Use a work email. Arc may ask you to confirm your email and wait for workspace approval before signing in.
        </p>
      </div>

      <form action="/api/auth/sign-up" method="post" className="mt-7 space-y-5 sm:mt-8">
        <input type="hidden" name="from" value={from} />

        <label className="animate-auth-element animate-auth-delay-300 block">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Email address</span>
          <span className="auth-input-shell mt-2 flex h-13 items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_86%,transparent)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition focus-within:border-[var(--accent-border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
            <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <input
              autoComplete="username"
              autoFocus
              required
              name="email"
              type="email"
              placeholder="operator@example.com"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </span>
        </label>

        <label className="animate-auth-element animate-auth-delay-400 block">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Password</span>
          <span className="auth-input-shell mt-2 flex h-13 items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_86%,transparent)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition focus-within:border-[var(--accent-border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
            <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <input
              autoComplete="new-password"
              minLength={8}
              required
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              onClick={() => setShowPassword((value) => !value)}
              type="button"
            >
              {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
            </button>
          </span>
        </label>

        {!canCreateAccount ? (
          <p
            aria-live="polite"
            className="animate-auth-element animate-auth-delay-500 rounded-lg border border-[var(--priority-border-soft)] bg-[var(--priority-soft)] px-3 py-2 text-sm leading-5 text-[var(--priority-text)]"
          >
            Account creation needs Supabase Auth to be configured first.
          </p>
        ) : errorMessage ? (
          <p
            aria-live="polite"
            className="animate-auth-element animate-auth-delay-500 rounded-lg border border-[var(--priority-border-soft)] bg-[var(--priority-soft)] px-3 py-2 text-sm leading-5 text-[var(--priority-text)]"
          >
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p
            aria-live="polite"
            className="animate-auth-element animate-auth-delay-500 rounded-lg border border-[var(--ok-border-soft)] bg-[var(--ok-soft)] px-3 py-2 text-sm leading-5 text-[var(--ok-text)]"
          >
            {successMessage}
          </p>
        ) : null}

        <PrimarySubmitButton
          className="animate-auth-element animate-auth-delay-600"
          disabled={!canCreateAccount}
          idleIcon={<UserPlus aria-hidden="true" className="h-4 w-4" />}
          idleLabel="Create account"
          pendingLabel="Creating account"
        />
      </form>

      <div className={`animate-auth-element animate-auth-delay-700 mt-5 grid gap-3 ${showSocialAuth ? "grid-cols-2" : "grid-cols-1"}`}>
        {showSocialAuth ? (
        <form action="/api/auth/sign-in/google" method="post">
          <input type="hidden" name="from" value={from} />
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] active:translate-y-px"
            type="submit"
          >
            <GoogleIcon />
            Google
          </button>
        </form>
        ) : null}
        <a
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] active:translate-y-px"
          href={`/login?from=${encodeURIComponent(from)}`}
        >
          Sign in
          <ArrowRight aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
        </a>
      </div>
    </AuthPageFrame>
  );
}

function PrimarySubmitButton({
  className,
  disabled = false,
  idleIcon,
  idleLabel,
  pendingLabel,
}: {
  className?: string;
  disabled?: boolean;
  idleIcon: React.ReactNode;
  idleLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`${className ?? ""} flex h-13 w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent-border-strong)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] shadow-[0_18px_36px_-28px_var(--accent)] transition hover:bg-[var(--accent-strong)] active:translate-y-px disabled:cursor-wait disabled:opacity-75`}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
      {pending ? <span aria-hidden="true" className="auth-submit-pulse h-2 w-2 rounded-full bg-current" /> : idleIcon}
    </button>
  );
}
