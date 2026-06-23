"use client";

import { ArrowRight, Globe, Sparkles } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/app/_components/page-header";

import { analyzeWebsiteAction, confirmBrandAction, skipActivationAction, type StartActionState } from "./actions";

const inputShell =
  "auth-input-shell mt-2 flex h-12 items-center gap-3 rounded-md border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_88%,transparent)] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition focus-within:border-[var(--accent-border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]";
const inputBase =
  "h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]";

function AnalyzeButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="sm" type="submit" variant="primary">
      {pending ? "Reading your site…" : "Analyze my website"}
      {pending ? null : <ArrowRight aria-hidden="true" className="h-4 w-4" />}
    </Button>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="sm" type="submit" variant="primary">
      {pending ? "Saving your brand…" : "Looks right — save it"}
    </Button>
  );
}

export function StartSetupForm({ orgName }: { orgName: string }) {
  const [state, analyze] = useActionState<StartActionState, FormData>(analyzeWebsiteAction, null);
  const preview = state?.phase === "preview" ? state : null;

  return (
    <div className="animate-auth-element w-full rounded-2xl border border-[var(--border-panel)] bg-[color-mix(in_srgb,var(--surface-panel)_78%,transparent)] p-6 shadow-[0_28px_90px_-64px_var(--accent)] backdrop-blur md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            Set up {orgName}
          </p>
          <h1 className="mt-3 font-serif text-[2rem] font-medium leading-[1.02] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[2.6rem]">
            Let Arc learn your brand.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
            Give Arc your website and it will read your business, pull your name, description, and
            logo, and use it to draft on-brand campaigns. You approve everything before it goes out.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- transparent brand mark served from /public. */}
        <img alt="Arc" className="h-auto w-16 shrink-0 object-contain sm:w-20" src="/brand/arc-mark.png" />
      </div>

      {!preview ? (
        <form action={analyze} className="mt-7">
          <label className="block">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Your website</span>
            <span className={inputShell}>
              <Globe aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <input
                autoComplete="url"
                autoFocus
                className={inputBase}
                inputMode="url"
                name="websiteUrl"
                placeholder="https://yourcompany.com"
                required
                type="text"
              />
            </span>
          </label>

          {state?.phase === "error" ? (
            <p
              aria-live="polite"
              className="mt-4 rounded-lg border border-[var(--priority-border-soft)] bg-[var(--priority-soft)] px-3 py-2 text-sm leading-5 text-[var(--priority-text)]"
            >
              {state.message}
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-3">
            <AnalyzeButton />
            <button
              className="text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              formAction={skipActivationAction}
              type="submit"
            >
              Skip for now
            </button>
          </div>
        </form>
      ) : (
        <form action={confirmBrandAction} className="mt-7">
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
              Here&rsquo;s what Arc found at <span className="text-[var(--text-primary)]">{preview.websiteUrl}</span>. Edit anything, then save.
            </p>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Business name</span>
              <span className={inputShell}>
                <input
                  className={inputBase}
                  defaultValue={preview.signal.title ?? orgName}
                  maxLength={120}
                  name="displayName"
                  required
                  type="text"
                />
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[var(--text-primary)]">What you do</span>
              <textarea
                className="mt-2 min-h-[88px] w-full rounded-md border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_88%,transparent)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border-strong)] focus:ring-2 focus:ring-[var(--accent-soft)] placeholder:text-[var(--text-muted)]"
                defaultValue={preview.signal.description ?? ""}
                maxLength={600}
                name="description"
                placeholder="A short description of your business, in your words."
              />
            </label>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <ConfirmButton />
            <button
              className="text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              formAction={analyze}
              name="websiteUrl"
              type="submit"
              value=""
            >
              Try a different site
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
