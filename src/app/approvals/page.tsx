import { connection } from "next/server";

import { PageHeader, StatusPill } from "@/app/_components/page-header";
import { TabNav } from "@/app/_components/tab-nav";
import { listApprovalCards, listApprovalHistory } from "@/lib/approvals/read-model";
import { getAgentName } from "@/lib/settings/agent-name";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { ApprovalHistoryTable } from "./approval-history-table";
import { ApprovalDetailPanel } from "./approval-detail-panel";
import { ApprovalQueueTable } from "./approval-queue-table";

type ApprovalTabKey = "queue" | "history";

type ApprovalsSearchParams = {
  tab?: string | string[];
  item?: string | string[];
};

export default async function ActivityPage({ searchParams }: { searchParams?: Promise<ApprovalsSearchParams> }) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const activeTab = normalizeTab(query.tab);
  const agentName = await getAgentName();
  // Scope the queue + ledger to the active org. The admin client bypasses RLS,
  // so this app-layer filter is the tenant boundary.
  const orgId = isSupabaseAdminConfigured() ? await getCurrentOrgId().catch(() => undefined) : undefined;
  const [queueItems, decisions] = isSupabaseAdminConfigured() ? await Promise.all([loadQueue(agentName, orgId), loadHistory(orgId)]) : [[], []];
  const selectedItemId = normalizeSearchValue(query.item);
  const selectedItem = selectedItemId ? queueItems.find((item) => item.id === selectedItemId) ?? null : null;

  return (
    <>
      <PageHeader
        eyebrow="Review"
        title="Approval queue and decision history"
        description={`${agentName} prepares campaign drafts, lead lists, assets, and recommendations. Humans approve what moves. This page does not send, publish, launch, spend, or contact anyone.`}
        aside={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={queueItems.length > 0 ? "amber" : "green"}>{queueItems.length} waiting</StatusPill>
            <StatusPill tone="amber">Outbound locked</StatusPill>
          </div>
        }
      />

      <TabNav
        ariaLabel="Review sections"
        activeKey={activeTab}
        columns="sm:grid-cols-2"
        className="mb-5"
        tabs={[
          { key: "queue", label: "Needs review", detail: "Active human approval gate.", count: queueItems.length, href: "/approvals" },
          { key: "history", label: "Decision history", detail: "Read-only approval ledger.", count: decisions.length, href: "/approvals?tab=history" },
        ]}
      />

      {activeTab === "queue" ? (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
          <ApprovalQueueTable items={queueItems} selectedItemId={selectedItemId} />
          <ApprovalDetailPanel item={selectedItem} requestedItemId={selectedItemId} agentName={agentName} />
        </div>
      ) : null}
      {activeTab === "history" ? <ApprovalHistoryTable decisions={decisions} /> : null}
    </>
  );
}

async function loadQueue(agentName: string, orgId: string | undefined) {
  try {
    return await listApprovalCards({ limit: 200, agentName, orgId });
  } catch {
    return [];
  }
}

async function loadHistory(orgId: string | undefined) {
  try {
    return await listApprovalHistory({ limit: 200, orgId });
  } catch {
    return [];
  }
}

function normalizeTab(value: string | string[] | undefined): ApprovalTabKey {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "history" ? "history" : "queue";
}

function normalizeSearchValue(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized && normalized.trim().length > 0 ? normalized.trim() : null;
}
