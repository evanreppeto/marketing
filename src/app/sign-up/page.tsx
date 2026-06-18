import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SignUpPage } from "@/components/ui/sign-in";
import { getAuthMode } from "@/lib/auth/auth-mode";
import {
  OPERATOR_COOKIE,
  getSafeOperatorReturnPath,
  isAuthScreenPreviewEnabled,
  isValidOperatorValue,
} from "@/lib/auth/operator-shared";
import { provisionAuthenticatedUser } from "@/lib/auth/user-provisioning";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

type SignUpSearchParams = {
  from?: string;
  error?: string;
  preview?: string;
  success?: string;
};

function getSignUpErrorMessage(error?: string) {
  if (error === "config") return "Account creation needs Supabase Auth to be configured first.";
  if (error === "exists") return "An account already exists for that email. Sign in instead.";
  if (error === "password") return "Use a password with at least 8 characters.";
  if (error === "profile") return "Enter your full name so your profile can be created.";
  if (error === "organization") return "Enter the organization name for the workspace you want to create.";
  if (error === "provision") return "The account was created, but workspace access could not be prepared. Ask an administrator to check memberships.";
  if (error === "1") return "We could not create that account. Try again or ask an administrator.";
  return null;
}

function getSignUpSuccessMessage(success?: string) {
  if (success === "check_email") return "Account created. Check your email for the confirmation link, then sign in.";
  if (success === "created") return "Account created. Next you can create or join a workspace.";
  return null;
}

export default async function SignUpRoute({
  searchParams,
}: {
  searchParams?: Promise<SignUpSearchParams>;
}) {
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

  return (
    <SignUpPage
      canCreateAccount={authMode === "supabase"}
      errorMessage={getSignUpErrorMessage(query.error)}
      from={from}
      showSocialAuth={authMode === "supabase"}
      successMessage={getSignUpSuccessMessage(query.success)}
    />
  );
}
