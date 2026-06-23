import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { buttonClasses } from "./page-header";
import { getAuthMode, type AuthMode } from "@/lib/auth/auth-mode";
import {
  OPERATOR_COOKIE,
  getSafeOperatorReturnPath,
  isAuthScreenPreviewEnabled,
  isValidOperatorValue,
} from "@/lib/auth/operator-shared";
import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { getAppSettings, getSupportContactEmail } from "@/lib/settings/store";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { AuthShell } from "@/components/ui/auth-shell";
import { SignInPage } from "@/components/ui/sign-in";

type LoginSearchParams = {
  from?: string;
  error?: string;
  preview?: string;
};

export async function getOperatorLoginProps(searchParams?: Promise<LoginSearchParams>) {
  const query = searchParams ? await searchParams : {};
  const from = getSafeOperatorReturnPath(query.from);
  const authMode = getAuthMode();
  const showPreview = isAuthScreenPreviewEnabled(query.preview);

  if (authMode === "open" && !showPreview) {
    redirect(from);
  }

  if (authMode === "supabase" && !showPreview) {
    const user = await getSupabaseAuthenticatedUser();

    if (user) {
      const provisioned = await provisionAuthenticatedUser(user);
      if (provisioned.ok && provisioned.status === "profile_only") {
        redirect(`/onboarding?from=${encodeURIComponent(from)}`);
      }
      redirect(from);
    }
  } else if (!showPreview) {
    const store = await cookies();

    if (isValidOperatorValue(store.get(OPERATOR_COOKIE)?.value)) {
      redirect(from);
    }
  }

  return {
    from,
    error: query.error,
    authMode,
  };
}

export async function getOperatorForgotPasswordProps() {
  const authMode = getAuthMode();

  if (authMode === "open") {
    redirect("/");
  }

  if (authMode === "supabase") {
    const user = await getSupabaseAuthenticatedUser();

    if (user) {
      redirect("/");
    }
  } else {
    const store = await cookies();

    if (isValidOperatorValue(store.get(OPERATOR_COOKIE)?.value)) {
      redirect("/");
    }
  }

  return {
    supportEmail: getSupportContactEmail(await getAppSettings()),
  };
}

export function OperatorLoginPage({ from, error, authMode }: { from: string; error?: string; authMode: AuthMode }) {
  const errorMessage =
    error === "passkey"
      ? "Passkey sign-in is not configured for this console yet."
      : error === "oauth_config"
        ? "Google sign-in needs Supabase Auth to be configured first."
        : error === "oauth"
          ? "Google sign-in could not be completed. Try again or use email."
          : error === "config"
            ? "Operator credentials are not configured yet."
            : error === "provision"
              ? "Your account signed in, but workspace access could not be prepared. Ask an administrator to check memberships."
              : error
                ? "That email or password was not accepted. Try again."
                : null;

  return (
    <SignInPage
      errorMessage={errorMessage}
      from={from}
      showSignUpLink={authMode === "supabase"}
      showSocialAuth={authMode === "supabase"}
    />
  );
}

export function OperatorForgotPasswordPage({ supportEmail }: { supportEmail: string }) {
  const supportHref = `mailto:${supportEmail}?subject=${encodeURIComponent("Arc password reset")}`;

  return (
    <AuthShell
      headline={
        <>
          Let&rsquo;s get you back <span className="italic text-[var(--accent)]">in</span>.
        </>
      }
      supporting="Passwords are managed by your administrator. Send a reset request and they'll confirm when your access is ready."
    >
      <h2 className="font-editorial text-[1.75rem] font-normal leading-[1.05] tracking-[-0.01em] text-[var(--text-primary)]">
        Reset access
      </h2>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">A quick note to your workspace administrator.</p>

      <div className="mt-6 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
        Send a reset request to <span className="font-medium text-[var(--text-primary)]">{supportEmail}</span>. They can update your
        credentials and confirm when access is ready.
      </div>

      <div className="mt-5 grid gap-3">
        <Link className={buttonClasses({ variant: "primary", className: "w-full" })} href={supportHref}>
          Request reset
        </Link>
        <Link className={buttonClasses({ variant: "ghost", className: "w-full" })} href="/login">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
