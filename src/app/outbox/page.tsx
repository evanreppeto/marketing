import { connection } from "next/server";

import { EmptyState, PageHeader, StatusPill } from "@/app/_components/page-header";
import { getOutboxList } from "@/lib/dispatch/read-model";
import { getAgentName } from "@/lib/settings/agent-name";

import { OutboxConsole } from "./_components/outbox-console";

export default async function OutboxPage() {
  await connection();

  const [list, agentName] = await Promise.all([getOutboxList(), getAgentName()]);

  return (
    <>
      <PageHeader
        eyebrow="Dispatch"
        title="Outbox"
        description={`Every approved deliverable that has been launched, and where it stands. The app records dispatch state and hands off to ${agentName} — it does not send, publish, or contact anyone.`}
        aside={<StatusPill tone="amber">Outbound locked</StatusPill>}
      />
      {list.status === "unavailable" ? (
        <EmptyState title="Outbox unavailable" detail={list.message} />
      ) : (
        <OutboxConsole dispatches={list.dispatches} />
      )}
    </>
  );
}
