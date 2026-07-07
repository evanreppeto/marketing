import Link from "next/link";

import { EtherealShadow } from "@/components/ui/etheral-shadow";
import { FormValidityMessages } from "@/components/ui/form-validity";
import { PasswordField } from "@/components/ui/password-field";

export const metadata = {
  title: "Create your workspace — Arc",
};

const WORKSPACE_TYPES = [
  { value: "company", label: "In-house team" },
  { value: "agency", label: "Agency" },
  { value: "individual", label: "Solo" },
];

const SIGN_UP_ERRORS: Record<string, string> = {
  config: "Sign-up isn't switched on yet. Try again in a moment.",
  password: "Use at least 8 characters for your password.",
  exists: "An account with that email already exists — sign in instead.",
  name: "Enter your first and last name.",
  organization: "Enter a name for your company or workspace.",
  workspace_intent: "Pick whether you're creating or joining a workspace.",
  provision: "Your account was created, but setup didn't finish. Sign in to continue.",
  "1": "Something went wrong creating your account. Try again.",
};

type SearchParams = { error?: string; success?: string; from?: string };

const labelClass = "block text-[0.8125rem] font-medium text-[var(--text-secondary)] mb-1.5";
const inputClass =
  "w-full min-h-[44px] rounded-lg bg-[var(--surface-inset)] border border-[color:var(--border-panel)] px-3.5 text-[0.9375rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[color:var(--accent)] focus:bg-[var(--surface-panel)]";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const error = params.error ? SIGN_UP_ERRORS[params.error] ?? "Something went wrong. Try again." : null;
  const checkEmail = params.success === "check_email";
  const from = params.from ?? "/home";

  return (
    <main className="min-h-screen w-full bg-[var(--canvas)] text-[var(--text-primary)] lg:grid lg:grid-cols-[1fr_1.05fr]">
      {/* Thesis / brand column — atmospheric obsidian-gold haze behind the one serif moment */}
      <aside className="relative hidden overflow-hidden border-r border-[color:var(--border-panel)] bg-[var(--canvas-deep)] lg:block">
        <div className="absolute inset-0">
          <EtherealShadow
            sizing="fill"
            color="rgba(200, 162, 74, 0.42)"
            animation={{ scale: 48, speed: 62 }}
            noise={{ opacity: 0.3, scale: 1.4 }}
          />
        </div>
        {/* Legibility scrims: keep content crisp; let the haze glow toward the seam */}
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--canvas-deep)] from-10% via-[var(--canvas-deep)]/85 via-55% to-[var(--canvas-deep)]/25" />
        <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[var(--canvas-deep)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[var(--canvas-deep)] to-transparent" />

        <div className="relative z-10 flex h-full flex-col justify-between px-12 py-14">
          <img src="/icon.png" alt="Arc" className="h-9 w-auto self-start drop-shadow-[0_4px_14px_rgba(0,0,0,0.55)]" />

          <div className="max-w-[30ch]">
            <h1 className="font-serif text-[2.6rem] font-normal leading-[1.08] text-[var(--text-primary)]">
              Marketing that does the work — you keep the final say.
            </h1>
            <p className="mt-6 max-w-[42ch] text-[0.975rem] leading-relaxed text-[var(--text-secondary)]">
              Arc finds source-backed opportunities, drafts campaigns, and prepares creative from your
              real proof. Nothing reaches a customer until you approve it.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
            <span className="font-[family-name:var(--font-mono)] text-[0.75rem] tracking-[0.02em] text-[var(--text-muted)]">
              Outbound stays locked until you approve
            </span>
          </div>
        </div>
      </aside>

      {/* Form column */}
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[27rem]">
          <div className="mb-9 lg:hidden">
            <img src="/icon.png" alt="Arc" className="h-8 w-auto" />
          </div>

          <h2 className="font-[family-name:var(--font-display)] text-[1.6rem] font-semibold leading-tight text-[var(--text-primary)]">
            Create your workspace
          </h2>
          <p className="mt-2 text-[0.925rem] text-[var(--text-secondary)]">
            Set up your company on Arc. You can invite your team next.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-6 rounded-lg border border-[color:color-mix(in_srgb,var(--priority)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--priority)_12%,transparent)] px-3.5 py-2.5 text-[0.85rem] text-[var(--text-primary)]"
            >
              {error}
            </p>
          ) : null}

          {checkEmail ? (
            <p
              role="status"
              className="mt-6 rounded-lg border border-[color:color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] px-3.5 py-2.5 text-[0.85rem] text-[var(--text-primary)]"
            >
              Check your email to confirm your address, then sign in.
            </p>
          ) : null}

          <form action="/api/auth/sign-up" method="post" className="mt-7 space-y-4">
            <FormValidityMessages />
            <input type="hidden" name="workspaceIntent" value="create" />
            <input type="hidden" name="from" value={from} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className={labelClass}>
                  First name
                </label>
                <input id="firstName" name="firstName" autoComplete="given-name" required className={inputClass} />
              </div>
              <div>
                <label htmlFor="lastName" className={labelClass}>
                  Last name
                </label>
                <input id="lastName" name="lastName" autoComplete="family-name" required className={inputClass} />
              </div>
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>
                Work email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <PasswordField
                id="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                className={inputClass}
              />
            </div>

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
                    <input
                      type="radio"
                      name="workspaceType"
                      value={t.value}
                      defaultChecked={i === 0}
                      className="sr-only"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-[0.9375rem] font-semibold text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[color:color-mix(in_srgb,var(--accent)_92%,white)] active:translate-y-px"
            >
              Create workspace
            </button>
          </form>

          <p className="mt-6 text-[0.875rem] text-[var(--text-secondary)]">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
