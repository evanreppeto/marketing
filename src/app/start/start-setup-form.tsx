"use client";

import { Globe } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/app/_components/page-header";
import { AUTH_FIELD_INPUT, AUTH_FIELD_SHELL, AUTH_FORM_HEADING, AUTH_LABEL } from "@/components/ui/auth-field";

import { analyzeWebsiteAction, confirmBrandAction, skipActivationAction, type StartActionState } from "./actions";

function AnalyzeButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="primary">
      {pending ? "Reading your site…" : "Analyze my website"}
    </Button>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="primary">
      {pending ? "Saving your brand…" : "Looks right — save it"}
    </Button>
  );
}

export function StartSetupForm({ orgName }: { orgName: string }) {
  const [state, analyze] = useActionState<StartActionState, FormData>(analyzeWebsiteAction, null);
  const preview = state?.phase === "preview" ? state : null;

  if (preview) {
    return (
      <div>
        <h2 className={AUTH_FORM_HEADING}>Confirm your brand</h2>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Edit anything Arc got wrong, then save it.</p>

        <form action={confirmBrandAction} className="mt-6">
          <input name="websiteUrl" type="hidden" value={preview.websiteUrl} />
          <input name="faviconUrl" type="hidden" value={preview.signal.faviconUrl ?? ""} />

          <div className="flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
            {preview.signal.faviconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote favicon preview
              <img alt="" className="h-8 w-8 shrink-0 rounded object-contain" src={preview.signal.faviconUrl} />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-[var(--surface-raised)] text-[var(--text-muted)]">
                <Globe aria-hidden="true" className="h-4 w-4" />
              </span>
            )}
            <p className="text-sm text-[var(--text-secondary)]">
              From <span className="text-[var(--text-primary)]">{preview.websiteUrl}</span>
            </p>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className={AUTH_LABEL}>Business name</span>
              <span className={AUTH_FIELD_SHELL}>
                <input className={AUTH_FIELD_INPUT} defaultValue={preview.signal.title ?? orgName} maxLength={120} name="displayName" required type="text" />
              </span>
            </label>

            <label className="block">
              <span className={AUTH_LABEL}>What you do</span>
              <textarea
                className="mt-2 min-h-[88px] w-full rounded-lg border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_82%,transparent)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border-strong)] focus:ring-2 focus:ring-[var(--accent-soft)] placeholder:text-[var(--text-muted)]"
                defaultValue={preview.signal.description ?? ""}
                maxLength={600}
                name="description"
                placeholder="A short description of your business, in your words."
              />
            </label>
          </div>

          <div className="mt-5 flex items-center gap-4">
            <ConfirmButton />
            <button className="text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]" formAction={analyze} name="websiteUrl" type="submit" value="">
              Try a different site
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h2 className={AUTH_FORM_HEADING}>Add your website</h2>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Arc reads it and pulls your name, description, and logo.</p>

      <form action={analyze} className="mt-6">
        <label className="block">
          <span className={AUTH_LABEL}>Your website</span>
          <span className={AUTH_FIELD_SHELL}>
            <Globe aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <input autoComplete="url" autoFocus className={AUTH_FIELD_INPUT} inputMode="url" name="websiteUrl" placeholder="https://yourcompany.com" required type="text" />
          </span>
        </label>

        {state?.phase === "error" ? (
          <p aria-live="polite" className="mt-4 rounded-lg border border-[var(--priority-border-soft)] bg-[var(--priority-soft)] px-3 py-2 text-sm leading-5 text-[var(--priority-text)]">
            {state.message}
          </p>
        ) : null}

        <div className="mt-5 flex items-center gap-4">
          <AnalyzeButton />
          <button className="text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]" formAction={skipActivationAction} type="submit">
            Skip for now
          </button>
        </div>
      </form>
    </div>
  );
}
