import { redirect } from "next/navigation";

import { createWorkspaceAction, joinWorkspaceAction } from "./actions";
import { buttonClasses } from "../_components/page-header";
import { theme } from "../_components/theme";
import { AuthShell } from "@/components/ui/auth-shell";
import { getAuthMode } from "@/lib/auth/auth-mode";
import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Set up" };

type OnboardingSearchParams = {
  from?: string;
  error?: string;
};

function errorMessageFor(error?: string) {
  if (error === "not_authenticated") return "Sign in before creating a workspace.";
  if (error === "not_configured") return "Supabase admin access is required before workspaces can be created.";
  if (error === "invalid_input") return "Enter the required workspace details or invite code.";
  if (error === "already_claimed") return "That organization already has members. Ask an owner or admin to invite you.";
  if (error === "not_found") return "That invite code is invalid or has already been used.";
  if (error === "email_mismatch") return "That invite code is tied to a different email address.";
  if (error === "expired") return "That invite code has expired. Ask an owner for a new one.";
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
    <AuthShell
      formMaxWidth="max-w-[460px]"
      headline={<>Create the place where Arc learns.</>}
      supporting="Each organization owns its workspaces, members, brand context, memory, and agent configuration."
    >
      <div className="grid gap-4">
            <form
              action={joinWorkspaceAction}
              className="rounded-xl border border-[var(--border-panel)] bg-[oklch(0.105_0.026_250/0.78)] p-5 shadow-[0_28px_80px_-52px_oklch(0.74_0.115_232)] backdrop-blur-md sm:p-6"
            >
              <input name="from" type="hidden" value={from} />
              <div>
                <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">Join with a code</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  Use the workspace invite code an owner or admin shared with you.
                </p>
              </div>

              {errorMessage ? (
                <div className="mt-4 rounded-lg border border-[var(--priority-border)] bg-[var(--priority-soft)] px-3 py-2 text-sm text-[var(--priority-text)]">
                  {errorMessage}
                </div>
              ) : null}

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm font-medium text-[var(--text-primary)]">
                  Invite code
                  <input
                    autoComplete="one-time-code"
                    className={theme.control.input}
                    maxLength={32}
                    minLength={4}
                    name="inviteCode"
                    placeholder="ABCD-2345"
                    required
                  />
                </label>
              </div>

              <div className="mt-6">
                <button className={buttonClasses({ variant: "primary", className: "w-full" })} type="submit">
                  Join workspace
                </button>
              </div>
            </form>

            <form
              action={createWorkspaceAction}
              className="rounded-xl border border-[var(--border-panel)] bg-[oklch(0.105_0.026_250/0.64)] p-5 backdrop-blur-md sm:p-6"
            >
              <input name="from" type="hidden" value={from} />
              <div>
                <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">Create a workspace</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  Start a new company account when you are the owner or first admin.
                </p>
              </div>

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
                    placeholder="Acme Restoration"
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
                <button className={buttonClasses({ variant: "ghost", className: "w-full" })} type="submit">
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
      </div>
    </AuthShell>
  );
}
