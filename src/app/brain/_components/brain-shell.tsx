"use client";

import { useMemo, useState } from "react";

import { nodeProvenance, type BrainSourceSystem } from "@/domain";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { ApprovalQueue } from "./approval-queue";
import { BrainBrowser } from "./brain-browser";
import { BrainQuickSwitcher } from "./brain-quick-switcher";
import { BrainSourceFilter } from "./brain-source-filter";
import { BrainWorkspace } from "./brain-workspace";
import { RecentlyLearned } from "./recently-learned";

type Props = {
  graphNodes: BrainNode[];
  graphEdges: BrainEdge[];
  allNodes: BrainNode[];
  proposedNodes: BrainNode[];
  agentName: string;
};

/** "all" plus the six source systems. */
export type SourceFilter = "all" | BrainSourceSystem;

function matchesSource(node: BrainNode, filter: SourceFilter): boolean {
  if (filter === "all") return true;
  return nodeProvenance(node).system === filter;
}

export function BrainShell({ graphNodes, graphEdges, allNodes, proposedNodes, agentName }: Props) {
  const [source, setSource] = useState<SourceFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const flagship = graphNodes.find((n) => /emergency water/i.test(n.label));
    const hub = graphNodes.find((n) => n.kind === "arc" || n.kind === "hub");
    return flagship?.id ?? hub?.id ?? graphNodes[0]?.id ?? null;
  });

  const filteredGraphNodes = useMemo(() => graphNodes.filter((n) => matchesSource(n, source)), [graphNodes, source]);
  const filteredGraphIds = useMemo(() => new Set(filteredGraphNodes.map((n) => n.id)), [filteredGraphNodes]);
  const filteredEdges = useMemo(
    () => graphEdges.filter((e) => filteredGraphIds.has(e.fromNodeId) && filteredGraphIds.has(e.toNodeId)),
    [graphEdges, filteredGraphIds],
  );
  const filteredAll = useMemo(() => allNodes.filter((n) => matchesSource(n, source)), [allNodes, source]);

  return (
    <div className="flex flex-col gap-6">
      <BrainSourceFilter nodes={allNodes} active={source} onChange={setSource} />
      <BrainWorkspace
        nodes={filteredGraphNodes}
        edges={filteredEdges}
        agentName={agentName}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <RecentlyLearned nodes={filteredAll} />
        <ApprovalQueue nodes={proposedNodes} />
      </div>
      <BrainBrowser nodes={filteredAll} agentName={agentName} />
      <BrainQuickSwitcher
        nodes={graphNodes}
        onSelect={(id) => {
          setSource("all");
          setSelectedId(id);
        }}
      />
    </div>
  );
}
