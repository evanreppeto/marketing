import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { buttonClasses } from "./page-header";
import { getAuthMode, type AuthMode } from "@/lib/auth/auth-mode";
import {
  OPERATOR_COOKIE,
  getSafeOperatorReturnPath,
  isValidOperatorValue,
} from "@/lib/auth/operator-shared";
import { getAppSettings, getSupportContactEmail } from "@/lib/settings/store";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { SignInPage } from "@/components/ui/sign-in";

type LoginSearchParams = {
  from?: string;
  error?: string;
};

export async function getOperatorLoginProps(searchParams?: Promise<LoginSearchParams>) {
  const query = searchParams ? await searchParams : {};
  const from = getSafeOperatorReturnPath(query.from);
  const authMode = getAuthMode();

  if (authMode === "open") {
    redirect(from);
  }

  if (authMode === "supabase") {
    const user = await getSupabaseAuthenticatedUser();

    if (user) {
      redirect(from);
    }
  } else {
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
            : error
              ? "That email or password was not accepted. Try again."
              : null;

  return (
    <SignInPage
      authLabel="Operator Access"
      description={
        authMode === "supabase"
          ? "Use your Arc account to continue into campaigns, CRM, approvals, and operator workflows."
          : "Enter your operator email and password to open Arc."
      }
      errorMessage={errorMessage}
      from={from}
      showSignUpLink={authMode === "supabase"}
      showSocialAuth={authMode === "supabase"}
      title="Sign in to Arc"
    />
  );
}

export function OperatorForgotPasswordPage({ supportEmail }: { supportEmail: string }) {
  const supportHref = `mailto:${supportEmail}?subject=${encodeURIComponent("Arc password reset")}`;

  return (
    <OperatorAuthSurface>
      <LogoArc widthClassName="w-36" />

      <div className="mt-7 text-center">
        <h1 className="font-display text-[1.8rem] font-bold leading-tight tracking-[-0.04em] text-[var(--text-primary)]">
          Reset access
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Operator passwords are managed by the app administrator.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
        Send a reset request to <span className="font-semibold text-[var(--text-primary)]">{supportEmail}</span>. The administrator can
        update your operator credentials and confirm when access is ready.
      </div>

      <div className="mt-5 grid gap-3">
        <Link className={buttonClasses({ variant: "primary", className: "w-full" })} href={supportHref}>
          Request reset
        </Link>
        <Link className={buttonClasses({ variant: "ghost", className: "w-full" })} href="/login">
          Back to sign in
        </Link>
      </div>
    </OperatorAuthSurface>
  );
}

function LogoArc({ widthClassName }: { widthClassName: string }) {
  return (
    <div className="flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- brand mark served from /public. */}
      <img alt="Arc" className={`h-auto object-contain ${widthClassName}`} src="/brand/arc-mark.png" />
    </div>
  );
}

function OperatorAuthSurface({ children }: { children: React.ReactNode }) {
  return (
    <main className="chicago-dark relative flex min-h-[100dvh] overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      <Image
        alt=""
        aria-hidden="true"
        className="object-cover"
        fill
        priority
        sizes="100vw"
        src="/brand/login-background-v2.png"
      />
      <div className="absolute inset-0 bg-[oklch(0.07_0.022_250/0.64)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(0deg,var(--canvas)_0%,transparent_100%)]" />

      <div className="relative z-10 flex min-h-[100dvh] w-full items-center justify-center px-5 py-8">
        <section className="w-full max-w-[430px] rounded-xl border border-[var(--border-panel)] bg-[oklch(0.105_0.026_250/0.72)] p-6 shadow-[0_28px_80px_-52px_oklch(0.74_0.115_232)] backdrop-blur-md sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}
