import Link from "next/link";
import { connection } from "next/server";

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
              {decisions.map((row: ApprovalHistoryEntry) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-[var(--text-secondary)]">{formatWhen(row.decidedAt)}</td>
                  <td className="px-5 py-3"><StatusPill tone={decisionTone(row.decision)}>{row.decision}</StatusPill></td>
                  <td className="px-5 py-3 text-[var(--text-primary)]">{row.itemType}</td>
                  <td className="px-5 py-3">
                    {row.campaignId ? (
                      <Link className="font-semibold text-[var(--accent)] hover:underline" href={`/campaigns/${row.campaignId}`}>
                        {row.campaignName ?? row.campaignId}
                      </Link>
                    ) : (
                      <span className="text-[var(--text-muted)]">&mdash;</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">{row.decidedBy}</td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">{row.decisionNotes ?? ""}</td>
                </tr>
              ))}
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
