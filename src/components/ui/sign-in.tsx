"use client";

import { ArrowRight, Building2, KeyRound, Mail, User, UserPlus } from "lucide-react";
import React, { useState } from "react";
import { useFormStatus } from "react-dom";

import { AuthShell } from "./auth-shell";
import { AUTH_ERROR_BOX, AUTH_FIELD_INPUT, AUTH_FIELD_SHELL, AUTH_FORM_HEADING, AUTH_LABEL } from "./auth-field";
import { PasswordField } from "./password-field";

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

const fieldShell = AUTH_FIELD_SHELL;
const fieldInput = AUTH_FIELD_INPUT;
const labelText = AUTH_LABEL;
const formHeading = AUTH_FORM_HEADING;
const errorBox = AUTH_ERROR_BOX;

type SignInPageProps = {
  from: string;
  errorMessage?: string | null;
  forgotPasswordHref?: string;
  showSignUpLink?: boolean;
  showSocialAuth?: boolean;
};

export function SignInPage({
  from,
  errorMessage,
  forgotPasswordHref = "/forgot-password",
  showSignUpLink = false,
  showSocialAuth = false,
}: SignInPageProps) {
  return (
    <AuthShell
      headline={
        <>
          Marketing that moves only when you say <span className="italic text-[var(--accent)]">yes</span>.
        </>
      }
      supporting="Arc finds the work, drafts the campaigns, and prepares the assets. Nothing reaches the outside world without your approval."
      meta={["Approval-gated", "Persona-aware", "Source-backed"]}
    >
      <h2 className={formHeading}>Sign in</h2>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Continue into campaigns, CRM, and approvals.</p>

      <form action="/api/auth/sign-in" method="post" className="mt-7 space-y-4">
        <input type="hidden" name="from" value={from} />

        <label className="block">
          <span className={labelText}>Email</span>
          <span className={fieldShell}>
            <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <input autoComplete="username" autoFocus required name="email" type="email" placeholder="you@company.com" className={fieldInput} />
          </span>
        </label>

        <label className="block">
          <span className="flex items-center justify-between gap-3">
            <span className={labelText}>Password</span>
            <a
              className="rounded text-xs font-medium text-[var(--accent)] outline-none transition hover:text-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
              href={forgotPasswordHref}
            >
              Forgot?
            </a>
          </span>
          <PasswordField autoComplete="current-password" name="password" />
        </label>

        <label className="flex cursor-pointer items-center gap-2.5 pt-0.5 text-sm text-[var(--text-secondary)]">
          <input
            className="auth-checkbox h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-[var(--border-strong)] bg-[var(--surface-inset)] transition checked:border-[var(--accent)] checked:bg-[var(--accent)]"
            name="rememberMe"
            type="checkbox"
            value="1"
          />
          <span>Remember me</span>
        </label>

        {errorMessage ? (
          <p aria-live="polite" className={errorBox}>
            {errorMessage}
          </p>
        ) : null}

        <PrimarySubmitButton idleIcon={<ArrowRight aria-hidden="true" className="h-4 w-4" />} idleLabel="Sign in" pendingLabel="Signing in" />
      </form>

      {showSocialAuth ? (
        <>
          <Divider />
          <form action="/api/auth/sign-in/google" className="mt-4" method="post">
            <input type="hidden" name="from" value={from} />
            <GhostButton>
              <GoogleIcon />
              Continue with Google
            </GhostButton>
          </form>
        </>
      ) : null}

      {showSignUpLink ? (
        <p className="mt-6 text-sm text-[var(--text-muted)]">
          New here?{" "}
          <a className="font-medium text-[var(--accent)] transition hover:text-[var(--accent-strong)]" href={`/sign-up?from=${encodeURIComponent(from)}`}>
            Create an account
          </a>
          .
        </p>
      ) : null}
    </AuthShell>
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
  const [workspaceIntent, setWorkspaceIntent] = useState<"create" | "join">("create");
  const creatingWorkspace = workspaceIntent === "create";

  return (
    <AuthShell
      formMaxWidth="max-w-[500px]"
      headline={<>Give every team a clean home for Arc to work in.</>}
      supporting="Each workspace keeps its own brand context, memory, members, and approvals — a tidy boundary Arc learns inside."
      meta={["Owner creates", "Team approves", "Arc learns"]}
    >
      <h2 className={formHeading}>Create your account</h2>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Start a company workspace or join one with an invite code.</p>

      <form action="/api/auth/sign-up" method="post" className="mt-6">
        <input type="hidden" name="from" value={from} />

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelText}>First name</span>
              <span className={fieldShell}>
                <User aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <input autoComplete="given-name" autoFocus maxLength={48} name="firstName" placeholder="Evan" required type="text" className={fieldInput} />
              </span>
            </label>

            <label className="block">
              <span className={labelText}>Last name</span>
              <span className={fieldShell}>
                <User aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <input autoComplete="family-name" maxLength={48} name="lastName" placeholder="Ryan" required type="text" className={fieldInput} />
              </span>
            </label>
          </div>

          <label className="block">
            <span className={labelText}>Work email</span>
            <span className={fieldShell}>
              <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <input autoComplete="username" name="email" placeholder="you@company.com" required type="email" className={fieldInput} />
            </span>
          </label>

          <div role="tablist" aria-label="Workspace setup" className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-1">
            <SegmentButton active={creatingWorkspace} icon={<Building2 aria-hidden="true" className="h-4 w-4" />} label="Create workspace" onClick={() => setWorkspaceIntent("create")} />
            <SegmentButton active={!creatingWorkspace} icon={<KeyRound aria-hidden="true" className="h-4 w-4" />} label="Join with code" onClick={() => setWorkspaceIntent("join")} />
          </div>
          <input name="workspaceIntent" type="hidden" value={workspaceIntent} />

          {creatingWorkspace ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
              <label className="block">
                <span className={labelText}>Organization</span>
                <span className={fieldShell}>
                  <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <input autoComplete="organization" maxLength={96} name="organizationName" placeholder="Acme Co" required type="text" className={fieldInput} />
                </span>
              </label>

              <label className="block">
                <span className={labelText}>Type</span>
                <select
                  className="mt-2 h-12 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  defaultValue="company"
                  name="workspaceType"
                >
                  <option value="company">Company</option>
                  <option value="agency">Agency</option>
                  <option value="individual">Personal</option>
                </select>
              </label>
            </div>
          ) : (
            <label className="block">
              <span className={labelText}>Invite code</span>
              <span className={fieldShell}>
                <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <input
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  maxLength={32}
                  name="inviteCode"
                  placeholder="ACME-7K2M"
                  type="text"
                  className={`${fieldInput} font-mono uppercase tracking-[0.08em] placeholder:font-sans placeholder:tracking-normal`}
                />
              </span>
            </label>
          )}

          <label className="block">
            <span className={labelText}>Password</span>
            <PasswordField autoComplete="new-password" minLength={8} name="password" placeholder="At least 8 characters" />
          </label>
        </div>

        {!canCreateAccount ? (
          <p aria-live="polite" className={errorBox}>
            Account creation needs Supabase Auth to be configured first.
          </p>
        ) : errorMessage ? (
          <p aria-live="polite" className={errorBox}>
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p aria-live="polite" className="mt-4 rounded-lg border border-[var(--ok-border-soft)] bg-[var(--ok-soft)] px-3 py-2 text-sm leading-5 text-[var(--ok-text)]">
            {successMessage}
          </p>
        ) : null}

        <PrimarySubmitButton
          className="mt-5"
          disabled={!canCreateAccount}
          idleIcon={<UserPlus aria-hidden="true" className="h-4 w-4" />}
          idleLabel="Create account"
          pendingLabel="Creating account"
        />
      </form>

      <Divider />

      <div className={`grid gap-3 ${showSocialAuth ? "sm:grid-cols-2" : "grid-cols-1"}`}>
        {showSocialAuth ? (
          <form action="/api/auth/sign-in/google" method="post">
            <input type="hidden" name="from" value={from} />
            <GhostButton>
              <GoogleIcon />
              Google
            </GhostButton>
          </form>
        ) : null}
        <a
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]"
          href={`/login?from=${encodeURIComponent(from)}`}
        >
          Sign in
          <ArrowRight aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
        </a>
      </div>
    </AuthShell>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--border-hairline)]" />
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-secondary)]">or</span>
      <span className="h-px flex-1 bg-[var(--border-hairline)]" />
    </div>
  );
}

function SegmentButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] ${active ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--elev-control)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <span className={active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}>{icon}</span>
      {label}
    </button>
  );
}

function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] active:translate-y-px"
      type="submit"
    >
      {children}
    </button>
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
      className={`${className ?? ""} flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] shadow-[var(--elev-control)] outline-none transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)] active:translate-y-0 active:bg-[var(--accent-active)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0`}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
      {pending ? <span aria-hidden="true" className="auth-submit-pulse h-2 w-2 rounded-full bg-current" /> : idleIcon}
    </button>
  );
}
