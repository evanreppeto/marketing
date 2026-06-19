type WorkspaceAccessDecisionInput = {
  hasWorkspace: boolean;
  isSignedIn: boolean;
  pathname: string;
};

export type WorkspaceAccessDecision = { action: "allow" | "login" | "onboarding" };

export function getWorkspaceAccessDecision(input: WorkspaceAccessDecisionInput): WorkspaceAccessDecision {
  if (!input.isSignedIn) return { action: "login" };
  if (input.hasWorkspace) return { action: "allow" };
  if (input.pathname === "/onboarding" || input.pathname.startsWith("/onboarding/")) return { action: "allow" };
  return { action: "onboarding" };
}
