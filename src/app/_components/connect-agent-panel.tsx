import Link from "next/link";

import { buttonClasses, EmptyState } from "./page-header";

/**
 * Onboarding state shown when no agent is configured. Mounted on the Campaigns
 * library and in System status. Reuses the shared EmptyState surface.
 */
export function ConnectAgentPanel({ agentName }: { agentName: string }) {
  return (
    <EmptyState
      title={`Connect your ${agentName} agent`}
      detail={`No agent is wired up yet. Point this workspace at your Arc agent by setting its runner endpoint (ARC_RUNNER_URL) and API token (ARC_AGENT_API_TOKEN) in the environment. Once connected, ${agentName}'s drafts and approvals appear here automatically. Check status anytime in System status.`}
      action={
        <Link href="/settings" className={buttonClasses({ size: "sm" })}>
          Open System status
        </Link>
      }
    />
  );
}
