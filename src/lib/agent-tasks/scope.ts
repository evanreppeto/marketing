import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

export type AgentTaskTenantFields = {
  org_id: string;
  workspace_id: string;
};

export async function getCurrentAgentTaskTenantFields(): Promise<AgentTaskTenantFields> {
  const context = await getCurrentWorkspaceContext();
  if (!context.workspaceId) {
    throw new Error("No active workspace is available for this agent task.");
  }

  return {
    org_id: context.orgId,
    workspace_id: context.workspaceId,
  };
}
