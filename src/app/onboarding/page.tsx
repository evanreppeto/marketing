import Image from "next/image";
import { redirect } from "next/navigation";

import { createWorkspaceAction } from "./actions";
import { buttonClasses } from "../_components/page-header";
import { cx, theme } from "../_components/theme";
import { getAuthMode } from "@/lib/auth/auth-mode";
import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

type OnboardingSearchParams = {
  from?: string;
  error?: string;
};

function errorMessageFor(error?: string) {
  if (error === "not_authenticated") return "Sign in before creating a workspace.";
  if (error === "not_configured") return "Supabase admin access is required before workspaces can be created.";
  if (error === "invalid_input") return "Enter an organization and workspace name.";
  if (error === "already_claimed") return "That organization already has members. Ask an owner or admin to invite you.";
  if (error === "failed") return "Workspace creation failed. Try again or check the backend logs.";
  return null;
}

function defaultOrganizationName(email?: string | null) {
  const domain = email?.split("@")[1]?.split(".")[0];
  if (!domain) return "";
  return domain
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getPendingOnboardingValue(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<OnboardingSearchParams>;
}) {
  const query = searchParams ? await searchParams : {};
  const from = getSafeOperatorReturnPath(query.from);

  if (getAuthMode() !== "supabase") {
    redirect("/");
  }

  const user = await getSupabaseAuthenticatedUser();
  if (!user) {
    redirect(`/login?from=${encodeURIComponent("/onboarding")}`);
  }

  const provisioned = await provisionAuthenticatedUser(user);
  if (provisioned.ok && provisioned.status !== "profile_only") {
    redirect(from);
  }

  const pendingOrganizationName = getPendingOnboardingValue(user.user_metadata, "pending_organization_name");
  const pendingWorkspaceType = getPendingOnboardingValue(user.user_metadata, "pending_workspace_type");
  const initialName = pendingOrganizationName || defaultOrganizationName(user.email);
  const initialWorkspaceType = ["agency", "company", "individual"].includes(pendingWorkspaceType)
    ? pendingWorkspaceType
    : "company";
  const errorMessage = errorMessageFor(query.error);

  return (
    <main className="chicago-dark relative flex min-h-[100dvh] overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      <Image
        alt=""
        aria-hidden="true"
        className="object-cover opacity-70"
        fill
        priority
        sizes="100vw"
        src="/brand/login-background-v2.png"
      />
      <div className="absolute inset-0 bg-[oklch(0.07_0.022_250/0.72)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(0deg,var(--canvas)_0%,transparent_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-5xl items-center px-5 py-8">
        <section className="grid w-full gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,440px)] lg:items-center">
          <div className="max-w-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- brand mark served from /public. */}
            <img alt="Arc" className="h-auto w-32 object-contain" src="/brand/arc-mark.png" />
            <div className={cx("mt-8", theme.text.eyebrow)}>Workspace setup</div>
            <h1 className="mt-3 font-display text-[clamp(2rem,5vw,4.2rem)] font-semibold leading-[0.98] text-[var(--text-primary)]">
              Create the place where Arc learns.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--text-secondary)]">
              Each organization owns its workspaces, members, brand context, memory, and agent configuration.
            </p>
          </div>

          <form
            action={createWorkspaceAction}
            className="rounded-xl border border-[var(--border-panel)] bg-[oklch(0.105_0.026_250/0.78)] p-5 shadow-[0_28px_80px_-52px_oklch(0.74_0.115_232)] backdrop-blur-md sm:p-6"
          >
            <input name="from" type="hidden" value={from} />
            <div>
              <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">Organization</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Start with the company account. You can add more members after the workspace exists.
              </p>
            </div>

            {errorMessage ? (
              <div className="mt-4 rounded-lg border border-[var(--priority-border)] bg-[var(--priority-soft)] px-3 py-2 text-sm text-[var(--priority-text)]">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-[var(--text-primary)]">
                Organization name
                <input
                  autoComplete="organization"
                  className={theme.control.input}
                  defaultValue={initialName}
                  maxLength={96}
                  minLength={2}
                  name="organizationName"
                  placeholder="Big Shoulders Restoration"
                  required
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--text-primary)]">
                Workspace name
                <input
                  className={theme.control.input}
                  maxLength={96}
                  minLength={2}
                  name="workspaceName"
                  placeholder="Marketing workspace"
                  required
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--text-primary)]">
                Workspace type
                <select className={theme.control.input} defaultValue={initialWorkspaceType} name="workspaceType">
                  <option value="company">Company</option>
                  <option value="agency">Agency</option>
                  <option value="individual">Individual</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button className={buttonClasses({ variant: "primary", className: "w-full" })} type="submit">
                Create workspace
              </button>
              <button
                className={buttonClasses({ variant: "ghost", className: "w-full" })}
                formAction="/api/auth/sign-out"
                formMethod="post"
                type="submit"
              >
                Use another account
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
