import type { Metadata } from "next";
import {
  OperatorForgotPasswordPage,
  getOperatorForgotPasswordProps,
} from "../_components/operator-login-page";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  const props = await getOperatorForgotPasswordProps();
  return <OperatorForgotPasswordPage {...props} />;
}
