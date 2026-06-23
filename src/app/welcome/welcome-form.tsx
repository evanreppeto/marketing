"use client";

import { Eye, EyeOff, LockKeyhole, User } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/app/_components/page-header";
import { AUTH_FIELD_INPUT, AUTH_FIELD_SHELL, AUTH_FORM_HEADING, AUTH_LABEL } from "@/components/ui/auth-field";

import { completeInvitedAccountAction, type WelcomeActionState } from "./actions";

function SubmitButton({ pending }: { pending: boolean }) {
  const { pending: formPending } = useFormStatus();
  const isPending = pending || formPending;

  return (
    <Button className="mt-1 w-full" disabled={isPending} type="submit" variant="primary">
      {isPending ? "Finishing setup…" : "Finish setup"}
    </Button>
  );
}

export function WelcomeAccountForm({ workspaceName, role }: { workspaceName: string; role: string }) {
  const [state, action, pending] = useActionState<WelcomeActionState, FormData>(completeInvitedAccountAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div>
      <h2 className={AUTH_FORM_HEADING}>Finish your account</h2>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        Joining {workspaceName} as {role}.
      </p>

      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className={AUTH_LABEL}>Full name</span>
          <span className={AUTH_FIELD_SHELL}>
            <User aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <input autoComplete="name" autoFocus className={AUTH_FIELD_INPUT} name="fullName" placeholder="Your name" type="text" />
          </span>
        </label>

        <label className="block">
          <span className={AUTH_LABEL}>Password</span>
          <span className={AUTH_FIELD_SHELL}>
            <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <input
              autoComplete="new-password"
              className={AUTH_FIELD_INPUT}
              minLength={8}
              name="password"
              placeholder="At least 8 characters"
              required
              type={showPassword ? "text" : "password"}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              onClick={() => setShowPassword((v) => !v)}
              type="button"
            >
              {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
            </button>
          </span>
        </label>

        <label className="block">
          <span className={AUTH_LABEL}>Confirm password</span>
          <span className={AUTH_FIELD_SHELL}>
            <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <input
              autoComplete="new-password"
              className={AUTH_FIELD_INPUT}
              minLength={8}
              name="confirm"
              placeholder="Re-enter password"
              required
              type={showConfirm ? "text" : "password"}
            />
            <button
              aria-label={showConfirm ? "Hide password" : "Show password"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              onClick={() => setShowConfirm((v) => !v)}
              type="button"
            >
              {showConfirm ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
            </button>
          </span>
        </label>

        {state?.message ? (
          <p aria-live="polite" className="rounded-lg border border-[var(--priority-border-soft)] bg-[var(--priority-soft)] px-3 py-2 text-sm leading-5 text-[var(--priority-text)]">
            {state.message}
          </p>
        ) : null}

        <SubmitButton pending={pending} />
      </form>
    </div>
  );
}
