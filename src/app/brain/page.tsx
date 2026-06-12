import { PageHeader } from "@/app/_components/page-header";
import { ApprovalQueue } from "@/app/brain/_components/approval-queue";
import { BrainBrowser } from "@/app/brain/_components/brain-browser";
import { brainSummary, listNodes, listProposed } from "@/lib/knowledge-graph/read-model";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const [proposed, all, summary] = await Promise.all([listProposed(), listNodes({}), brainSummary()]);

  const proposedNodes = proposed.status === "live" ? proposed.nodes : [];
  const allNodes = all.status === "live" ? all.nodes : [];
  const summaryLine =
    summary.status === "live"
      ? `${summary.total} nodes · ${summary.byTier.trusted ?? 0} trusted · ${summary.byTier.proposed ?? 0} awaiting review`
      : "Brain unavailable — Supabase is not configured.";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing Brain"
        description={`Mark's durable marketing memory — brand facts, personas, proof, and what it has learned. ${summaryLine}`}
      />
      <ApprovalQueue nodes={proposedNodes} />
      <BrainBrowser nodes={allNodes} />
    </div>
  );
}
