import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SignUpPage } from "@/components/ui/sign-in";
import { getAuthMode } from "@/lib/auth/auth-mode";
import {
  OPERATOR_COOKIE,
  getSafeOperatorReturnPath,
  isValidOperatorValue,
} from "@/lib/auth/operator-shared";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

type SignUpSearchParams = {
  from?: string;
  error?: string;
  success?: string;
};

function getSignUpErrorMessage(error?: string) {
  if (error === "config") return "Account creation needs Supabase Auth to be configured first.";
  if (error === "exists") return "An account already exists for that email. Sign in instead.";
  if (error === "password") return "Use a password with at least 8 characters.";
  if (error === "1") return "We could not create that account. Try again or ask an administrator.";
  return null;
}

function getSignUpSuccessMessage(success?: string) {
  if (success === "check_email") return "Account created. Check your email for the confirmation link, then sign in.";
  if (success === "created") return "Account created. You can sign in now.";
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
