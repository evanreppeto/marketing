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
        title="Shared work for you and Mark"
        description="Move work across the board. Mark can prepare drafts; humans approve anything outbound."
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
      description="A simple shared queue: what Mark is doing, what humans need to review, and what is done."
      aside={<StatusPill tone="amber">Approval gated</StatusPill>}
    />
  );
}
