"use server";

import { redirect } from "next/navigation";

import { getSafeOperatorReturnPath } from "@/lib/auth/operator-shared";
import { createWorkspaceForAuthenticatedUser } from "@/lib/auth/workspace-onboarding";

export async function createWorkspaceAction(formData: FormData) {
  const from = getSafeOperatorReturnPath(String(formData.get("from") ?? "/"));
  const result = await createWorkspaceForAuthenticatedUser({
    organizationName: String(formData.get("organizationName") ?? ""),
    workspaceName: String(formData.get("workspaceName") ?? ""),
    workspaceType: String(formData.get("workspaceType") ?? "company"),
  });

  if (result.ok) {
    redirect(from === "/onboarding" ? "/" : from);
  }

  redirect(`/onboarding?error=${encodeURIComponent(result.status)}&from=${encodeURIComponent(from)}`);
}
