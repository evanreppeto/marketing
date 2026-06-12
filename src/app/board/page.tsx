import { connection } from "next/server";

import { EmptyState, PageHeader, StatusPill } from "../_components/page-header";
import { WorkspacePanel } from "../_components/workspace";
import { BoardViewSwitch } from "../agent-operations/board-view-switch";
import { getAgentOperationsDashboard } from "@/lib/agent-operations/read-model";

export default async function BoardPage() {
  await connection();

  const dashboard = await getAgentOperationsDashboard();

  if (dashboard.status === "unavailable") {
    return (
      <>
        <Header />
        <EmptyState title="Task board unavailable" detail={dashboard.message} />
      </>
    );
  }

  return (
    <>
      <Header />
      <WorkspacePanel
        className="p-0"
        eyebrow="Task queue"
        title="Queued, running, blocked, and completed work"
        description="You and Mark share this board. Create work, drag cards across the lifecycle. External action stays disabled — outbound waits behind approval."
        aside={<StatusPill tone="amber">Outbound locked</StatusPill>}
      >
        <BoardViewSwitch tasks={dashboard.tasks} />
      </WorkspacePanel>
    </>
  );
}

function Header() {
  return (
    <PageHeader
      title="Task Board"
      description="A shared Kanban board for you and Mark. Drag a card to change its state; the approval gate keeps outbound locked."
      aside={<StatusPill tone="amber">No outbound execution</StatusPill>}
    />
  );
}
