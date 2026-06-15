import { connection } from "next/server";

import { EmptyState, PageHeader, StatusPill } from "../_components/page-header";
import { WorkspacePanel } from "../_components/workspace";
import { BoardViewSwitch } from "../agent-operations/board-view-switch";
import { getAgentOperationsDashboard } from "@/lib/agent-operations/read-model";
import { getAgentName } from "@/lib/settings/agent-name";

export default async function BoardPage() {
  await connection();

  const agentName = await getAgentName();
  const dashboard = await getAgentOperationsDashboard(undefined, agentName);

  if (dashboard.status === "unavailable") {
    return (
      <>
        <Header agentName={agentName} />
        <EmptyState title="Task board unavailable" detail={dashboard.message} />
      </>
    );
  }

  return (
    <>
      <Header agentName={agentName} />
      <WorkspacePanel
        className="p-0"
        eyebrow="Task queue"
        title={`Shared work for you and ${agentName}`}
        description={`Move work across the board. ${agentName} can prepare drafts; humans approve anything outbound.`}
        aside={<StatusPill tone="amber">Outbound locked</StatusPill>}
      >
        <BoardViewSwitch tasks={dashboard.tasks} />
      </WorkspacePanel>
    </>
  );
}

function Header({ agentName }: { agentName: string }) {
  return (
    <PageHeader
      title="Task Board"
      description={`A simple shared queue: what ${agentName} is doing, what humans need to review, and what is done.`}
      aside={<StatusPill tone="amber">Approval gated</StatusPill>}
    />
  );
}
