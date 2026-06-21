"use client";

import { useMemo, useState } from "react";

import { cx, theme } from "@/app/_components/theme";
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

type Tab = "web" | "recent" | "review" | "facts";

function matchesSource(node: BrainNode, filter: SourceFilter): boolean {
  if (filter === "all") return true;
  return nodeProvenance(node).system === filter;
}

export function BrainShell({ graphNodes, graphEdges, allNodes, proposedNodes, agentName }: Props) {
  const [source, setSource] = useState<SourceFilter>("all");
  const [tab, setTab] = useState<Tab>("web");
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
  const filteredProposed = useMemo(() => proposedNodes.filter((n) => matchesSource(n, source)), [proposedNodes, source]);

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "web", label: "Knowledge Web", count: filteredGraphNodes.length },
    { key: "recent", label: "Recently Learned" },
    { key: "review", label: "Needs Review", count: filteredProposed.length },
    { key: "facts", label: "All Facts", count: filteredAll.length },
  ];

  // Jumping to a fact (⌘K, or a link surfaced on another tab) always lands on the
  // web view with the filter cleared so the fact is guaranteed visible.
  const jumpTo = (id: string) => {
    setSource("all");
    setTab("web");
    setSelectedId(id);
  };

  return (
    <div className="flex flex-col gap-5">
      <BrainSourceFilter nodes={allNodes} active={source} onChange={setSource} />

      <nav aria-label="Brain sections" className={theme.control.tabList}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={active ? "page" : undefined}
              className={cx(theme.control.tabBase, active ? theme.control.tabActive : theme.control.tabIdle)}
            >
              <span className="truncate text-sm font-bold text-current">{t.label}</span>
              {t.count !== undefined ? (
                <span className={cx(theme.control.tabBadge, active ? "text-[var(--accent)]" : "")}>{t.count}</span>
              ) : null}
              {active ? <span aria-hidden className={theme.control.tabMarker} /> : null}
            </button>
          );
        })}
      </nav>

      {tab === "web" && (
        <BrainWorkspace
          nodes={filteredGraphNodes}
          edges={filteredEdges}
          agentName={agentName}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
      {tab === "recent" && <RecentlyLearned nodes={filteredAll} />}
      {tab === "review" && <ApprovalQueue nodes={filteredProposed} />}
      {tab === "facts" && <BrainBrowser nodes={filteredAll} agentName={agentName} />}

      <BrainQuickSwitcher nodes={graphNodes} onSelect={jumpTo} />
    </div>
  );
}
