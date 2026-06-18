import Link from "next/link";

import { buttonClasses, EmptyState } from "./page-header";

/**
 * Onboarding state shown when no agent is configured. Mounted on the Campaigns
 * library and in System status. Reuses the shared EmptyState surface.
 */
export function ConnectAgentPanel({ agentName }: { agentName: string }) {
  return (
    <EmptyState
      title={`Finish the ${agentName} connection`}
      detail={`This workspace can hold briefs, drafts, and approvals now. Connect the runner when you want ${agentName} to prepare work in the background, then send a test ping before relying on live tasks.`}
      action={
        <Link href="/settings?section=agent" className={buttonClasses({ size: "sm" })}>
          Open agent setup
        </Link>
      }
    />
  );
}
