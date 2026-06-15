import { PageHeader } from "@/app/_components/page-header";
import { ApprovalQueue } from "@/app/brain/_components/approval-queue";
import { BrainBrowser } from "@/app/brain/_components/brain-browser";
import { BrainGraph } from "@/app/brain/_components/brain-graph";
import { getBrainGraph } from "@/lib/knowledge-graph/graph";
import { brainSummary, listNodes, listProposed } from "@/lib/knowledge-graph/read-model";
import { getAgentName } from "@/lib/settings/agent-name";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const [graph, proposed, all, summary, agentName] = await Promise.all([
    getBrainGraph(),
    listProposed(),
    listNodes({}),
    brainSummary(),
    getAgentName(),
  ]);

  const graphNodes = graph.status === "live" ? graph.nodes : [];
  const graphEdges = graph.status === "live" ? graph.edges : [];
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
        description={`${agentName}'s durable marketing memory — brand facts, personas, proof, and what it has learned. ${summaryLine}`}
      />
      <BrainGraph nodes={graphNodes} edges={graphEdges} />
      <ApprovalQueue nodes={proposedNodes} />
      <BrainBrowser nodes={allNodes} agentName={agentName} />
    </div>
  );
}
