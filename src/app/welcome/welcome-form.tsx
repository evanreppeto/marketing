"use client";

import { Eye, EyeOff, LockKeyhole, User } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/app/_components/page-header";

import { completeInvitedAccountAction, type WelcomeActionState } from "./actions";

function SubmitButton({ pending }: { pending: boolean }) {
  const { pending: formPending } = useFormStatus();
  const isPending = pending || formPending;

  return (
    <Button disabled={isPending} size="sm" type="submit" variant="primary">
      {isPending ? "Finishing setup…" : "Finish setup"}
    </Button>
  );
}

export function WelcomeAccountForm({
  workspaceName,
  role,
}: {
  workspaceName: string;
  role: string;
}) {
  const [state, action, pending] = useActionState<WelcomeActionState, FormData>(
    completeInvitedAccountAction,
    null,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="animate-auth-element rounded-2xl border border-[var(--border-panel)] bg-[color-mix(in_srgb,var(--surface-panel)_76%,transparent)] p-5 shadow-[0_28px_90px_-64px_var(--accent)] backdrop-blur md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            Workspace setup
          </p>
          <h1 className="mt-3 font-serif text-[2rem] font-medium leading-[1] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[2.65rem]">
            You've joined {workspaceName}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--text-secondary)]">
            as {role} — set your name and a password to finish.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- transparent brand mark served from /public. */}
        <img alt="Arc" className="h-auto w-16 shrink-0 object-contain sm:w-20" src="/brand/arc-mark.png" />
      </div>

      <form action={action} className="mt-7">
        <div className="grid gap-4">
          <label className="block">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Full name</span>
            <span className="auth-input-shell mt-2 flex h-12 items-center gap-3 rounded-md border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_88%,transparent)] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition focus-within:border-[var(--accent-border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
              <User aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <input
                autoComplete="name"
                autoFocus
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                name="fullName"
                placeholder="Your name"
                type="text"
              />
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Password</span>
            <span className="auth-input-shell mt-2 flex h-12 items-center gap-3 rounded-md border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_88%,transparent)] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition focus-within:border-[var(--accent-border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
              <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <input
                autoComplete="new-password"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                minLength={8}
                name="password"
                placeholder="At least 8 characters"
                required
                type={showPassword ? "text" : "password"}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                onClick={() => setShowPassword((v) => !v)}
                type="button"
              >
                {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
              </button>
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Confirm password</span>
            <span className="auth-input-shell mt-2 flex h-12 items-center gap-3 rounded-md border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_88%,transparent)] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition focus-within:border-[var(--accent-border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
              <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <input
                autoComplete="new-password"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                minLength={8}
                name="confirm"
                placeholder="Re-enter password"
                required
                type={showConfirm ? "text" : "password"}
              />
              <button
                aria-label={showConfirm ? "Hide password" : "Show password"}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                onClick={() => setShowConfirm((v) => !v)}
                type="button"
              >
                {showConfirm ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
              </button>
            </span>
          </label>
        </div>

        {state?.message ? (
          <p
            aria-live="polite"
            className="mt-4 rounded-lg border border-[var(--priority-border-soft)] bg-[var(--priority-soft)] px-3 py-2 text-sm leading-5 text-[var(--priority-text)]"
          >
            {state.message}
          </p>
        ) : null}

        <div className="mt-5">
          <SubmitButton pending={pending} />
        </div>
      </form>
    </div>
  );
}
