import { AuthBrandPanel } from "@/components/ui/auth-brand-panel";
import { FormValidityMessages } from "@/components/ui/form-validity";
import { INDUSTRY_OPTIONS } from "@/lib/personas/industry-templates";

import { createWorkspaceAction, joinWorkspaceAction } from "./actions";

export const metadata = {
  title: "Set up your workspace — Arc",
};

const WORKSPACE_TYPES = [
  { value: "company", label: "In-house team" },
  { value: "agency", label: "Agency" },
  { value: "individual", label: "Solo" },
];

const ONBOARDING_ERRORS: Record<string, string> = {
  not_authenticated: "Your session expired. Sign in and try again.",
  not_configured: "Workspaces aren't available right now. Try again shortly.",
  invalid_input: "Enter a name for your company or workspace.",
  already_claimed: "That workspace already exists. Try a different name.",
  missing_email: "We couldn't read your email. Sign in again.",
  not_found: "That invite code is invalid or has already been used.",
  email_mismatch: "That invite code is tied to a different email address.",
  expired: "That invite code has expired. Ask an owner for a new one.",
  failed: "Something went wrong setting up your workspace. Try again.",
};

type SearchParams = { error?: string; from?: string };

const labelClass = "block text-[0.8125rem] font-medium text-[var(--text-secondary)] mb-1.5";
const inputClass =
  "w-full min-h-[44px] rounded-lg bg-[var(--surface-inset)] border border-[color:var(--border-panel)] px-3.5 text-[0.9375rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[color:var(--accent)] focus:bg-[var(--surface-panel)]";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const error = params.error ? ONBOARDING_ERRORS[params.error] ?? "Something went wrong. Try again." : null;
  const from = params.from ?? "/home";

  return (
    <main className="min-h-screen w-full bg-[var(--canvas)] text-[var(--text-primary)] lg:grid lg:grid-cols-[1fr_1.05fr]">
      <AuthBrandPanel
        headline="Set up your workspace."
        subline="This is where Arc goes to work for your company — finding opportunities and drafting campaigns, all behind your approval."
      />

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[27rem]">
          <div className="mb-9 lg:hidden">
            <img src="/icon.png" alt="Arc" className="h-8 w-auto" />
          </div>

          <h2 className="font-[family-name:var(--font-display)] text-[1.6rem] font-semibold leading-tight text-[var(--text-primary)]">
            Name your workspace
          </h2>
          <p className="mt-2 text-[0.925rem] text-[var(--text-secondary)]">
            One step to go. You can invite your team once you&apos;re in.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-6 rounded-lg border border-[color:color-mix(in_srgb,var(--priority)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--priority)_12%,transparent)] px-3.5 py-2.5 text-[0.85rem] text-[var(--text-primary)]"
            >
              {error}
            </p>
          ) : null}

          <form action={createWorkspaceAction} className="mt-7 space-y-4">
            <FormValidityMessages />
            <input type="hidden" name="from" value={from} />

            <div>
              <label htmlFor="organizationName" className={labelClass}>
                Company name
              </label>
              <input
                id="organizationName"
                name="organizationName"
                autoComplete="organization"
                required
                placeholder="Acme Inc."
                className={inputClass}
              />
            </div>

            <div>
              <span className={labelClass}>What are you running?</span>
              <div className="grid grid-cols-3 gap-2">
                {WORKSPACE_TYPES.map((t, i) => (
                  <label
                    key={t.value}
                    className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border border-[color:var(--border-panel)] bg-[var(--surface-inset)] px-2 text-center text-[0.85rem] text-[var(--text-secondary)] transition-colors has-[:checked]:border-[color:var(--accent)] has-[:checked]:bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] has-[:checked]:text-[var(--text-primary)]"
                  >
                    <input type="radio" name="workspaceType" value={t.value} defaultChecked={i === 0} className="sr-only" />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="industry" className={labelClass}>
                Your industry
              </label>
              <select id="industry" name="industry" defaultValue="general" className={inputClass}>
                {INDUSTRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[0.75rem] text-[var(--text-muted)]">
                Sets up a starter set of audience personas tailored to your business. You can edit them anytime.
              </p>
            </div>

            <button
              type="submit"
              className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-[0.9375rem] font-semibold text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[color:color-mix(in_srgb,var(--accent)_92%,white)] active:translate-y-px"
            >
              Create workspace
            </button>
          </form>

          <div className="my-7 flex items-center gap-3 text-[0.75rem] text-[var(--text-muted)]">
            <span className="h-px flex-1 bg-[var(--border-panel)]" />
            or
            <span className="h-px flex-1 bg-[var(--border-panel)]" />
          </div>

          <form action={joinWorkspaceAction} className="space-y-3">
            <input type="hidden" name="from" value={from} />
            <label htmlFor="inviteCode" className={labelClass}>
              Have an invite code?
            </label>
            <div className="flex gap-2">
              <input id="inviteCode" name="inviteCode" placeholder="Enter code" className={`${inputClass} flex-1`} />
              <button
                type="submit"
                className="min-h-[44px] shrink-0 rounded-lg border border-[color:var(--border-panel)] bg-[var(--surface-inset)] px-4 text-[0.875rem] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-raised)] active:translate-y-px"
              >
                Join
              </button>
            </div>
          </form>

          <form action="/api/auth/sign-out" method="post" className="mt-8">
            <p className="text-[0.8125rem] text-[var(--text-muted)]">
              Wrong account?{" "}
              <button type="submit" className="text-[var(--text-secondary)] underline-offset-4 hover:underline">
                Sign out
              </button>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
