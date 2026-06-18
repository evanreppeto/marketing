import { getOperatorLoginProps, OperatorLoginPage } from "../_components/operator-login-page";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; error?: string; preview?: string }>;
}) {
  const props = await getOperatorLoginProps(searchParams);
  return <OperatorLoginPage {...props} />;
}
