import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { PageHeader, StatusPill, EmptyState } from "@/app/_components/page-header";
import { listApprovalHistory, type ApprovalHistoryEntry } from "@/lib/approvals/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

function decisionTone(decision: string): "green" | "red" | "amber" | "gray" | "blue" {
  if (/approved/i.test(decision)) return "green";
  if (/declined|rejected|blocked/i.test(decision)) return "red";
  if (/revision/i.test(decision)) return "amber";
  if (/reverted/i.test(decision)) return "blue";
  return "gray";
}

export default async function ActivityPage() {
  await connection();

  const decisions = isSupabaseAdminConfigured() ? await loadHistory() : [];

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Decision history"
        description="A read-only record of every approval, decline, revision, and undo. Mark references this when planning. Decisions are made on Today or inside a campaign."
      />

      {decisions.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3">Decision</th>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Campaign</th>
                <th className="px-5 py-3">Who</th>
                <th className="px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {decisions.map((row: ApprovalHistoryEntry) => {
                const href = row.campaignId ? `/campaigns/${row.campaignId}` : `/approvals?item=${row.approvalItemId}`;

                return (
                  <tr key={row.id} className="group cursor-pointer align-top transition hover:bg-[var(--surface-inset)]">
                    <HistoryCell href={href} className="whitespace-nowrap font-mono text-xs text-[var(--text-secondary)]">
                      {formatWhen(row.decidedAt)}
                    </HistoryCell>
                    <HistoryCell href={href}>
                      <StatusPill tone={decisionTone(row.decision)}>{row.decision}</StatusPill>
                    </HistoryCell>
                    <HistoryCell href={href} className="font-semibold text-[var(--text-primary)]">
                      {row.itemType}
                    </HistoryCell>
                    <HistoryCell href={href}>
                      {row.campaignId ? (
                        <span className="font-semibold text-[var(--accent)] transition group-hover:text-[var(--accent-strong)]">
                          {row.campaignName ?? row.campaignId}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">&mdash;</span>
                      )}
                    </HistoryCell>
                    <HistoryCell href={href} className="text-[var(--text-secondary)]">
                      {row.decidedBy}
                    </HistoryCell>
                    <HistoryCell href={href} className="text-[var(--text-secondary)]">
                      {row.decisionNotes ?? ""}
                    </HistoryCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No decisions yet"
          detail="When you approve, decline, or revise work on Today or inside a campaign, it is recorded here."
        />
      )}
    </>
  );
}

async function loadHistory() {
  try {
    return await listApprovalHistory({ limit: 200 });
  } catch {
    return [];
  }
}

function formatWhen(iso: string) {
  return iso.replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function HistoryCell({
  children,
  className = "",
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  return (
    <td className="p-0">
      <Link className={`block h-full px-5 py-3 ${className}`} href={href}>
        {children}
      </Link>
    </td>
  );
}
