import {
  OperatorForgotPasswordPage,
  getOperatorForgotPasswordProps,
} from "../_components/operator-login-page";

export default async function ForgotPasswordPage() {
  const props = await getOperatorForgotPasswordProps();
  return <OperatorForgotPasswordPage {...props} />;
}
