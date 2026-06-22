import type { Metadata } from "next";
import { getOperatorLoginProps, OperatorLoginPage } from "../_components/operator-login-page";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; error?: string; preview?: string }>;
}) {
  const props = await getOperatorLoginProps(searchParams);
  return <OperatorLoginPage {...props} />;
}
