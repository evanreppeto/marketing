import { connection } from "next/server";

import { PageHeader } from "@/app/_components/page-header";
import { listApprovalHistory } from "@/lib/approvals/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { ApprovalHistoryTable } from "./approval-history-table";

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

      <ApprovalHistoryTable decisions={decisions} />
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
