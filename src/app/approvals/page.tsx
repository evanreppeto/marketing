import Link from "next/link";
import { connection } from "next/server";

import { PageHeader, StatusPill } from "@/app/_components/page-header";
import { listApprovalCards, listApprovalHistory } from "@/lib/approvals/read-model";
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
  const [queueItems, decisions] = isSupabaseAdminConfigured() ? await Promise.all([loadQueue(), loadHistory()]) : [[], []];
  const selectedItemId = normalizeSearchValue(query.item);
  const selectedItem = selectedItemId ? queueItems.find((item) => item.id === selectedItemId) ?? null : null;

  return (
    <>
      <PageHeader
        eyebrow="Review"
        title="Approval queue and decision history"
        description="Mark prepares campaign drafts, lead lists, assets, and recommendations. Humans approve what moves. This page does not send, publish, launch, spend, or contact anyone."
        aside={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={queueItems.length > 0 ? "amber" : "green"}>{queueItems.length} waiting</StatusPill>
            <StatusPill tone="amber">Outbound locked</StatusPill>
          </div>
        }
      />

      <ApprovalTabs activeTab={activeTab} queueCount={queueItems.length} historyCount={decisions.length} />

      {activeTab === "queue" ? (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
          <ApprovalQueueTable items={queueItems} selectedItemId={selectedItemId} />
          <ApprovalDetailPanel item={selectedItem} requestedItemId={selectedItemId} />
        </div>
      ) : null}
      {activeTab === "history" ? <ApprovalHistoryTable decisions={decisions} /> : null}
    </>
  );
}

async function loadQueue() {
  try {
    return await listApprovalCards({ limit: 200 });
  } catch {
    return [];
  }
}

async function loadHistory() {
  try {
    return await listApprovalHistory({ limit: 200 });
  } catch {
    return [];
  }
}

function ApprovalTabs({
  activeTab,
  historyCount,
  queueCount,
}: {
  activeTab: ApprovalTabKey;
  historyCount: number;
  queueCount: number;
}) {
  const tabs: Array<{ key: ApprovalTabKey; label: string; detail: string; count: number }> = [
    { key: "queue", label: "Needs review", detail: "Active human approval gate.", count: queueCount },
    { key: "history", label: "Decision history", detail: "Read-only approval ledger.", count: historyCount },
  ];

  return (
    <nav aria-label="Review sections" className="module-rise mb-5 grid gap-2 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2 shadow-[var(--elev-panel)] sm:grid-cols-2">
      {tabs.map((tab) => {
        const selected = activeTab === tab.key;
        return (
          <Link
            aria-current={selected ? "page" : undefined}
            className={`rounded-lg border px-4 py-3 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] ${
              selected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border-hairline)] bg-[var(--surface-inset)]"
            }`}
            href={tab.key === "queue" ? "/approvals" : `/approvals?tab=${tab.key}`}
            key={tab.key}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-black text-[var(--text-primary)]">{tab.label}</span>
              <span className="rounded-full bg-current/10 px-2 py-0.5 text-xs font-bold text-[var(--accent)]">{tab.count}</span>
            </span>
            <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tab.detail}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function normalizeTab(value: string | string[] | undefined): ApprovalTabKey {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "history" ? "history" : "queue";
}

function normalizeSearchValue(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized && normalized.trim().length > 0 ? normalized.trim() : null;
}
