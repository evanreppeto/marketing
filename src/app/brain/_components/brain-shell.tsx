"use client";

import { useMemo, useState } from "react";

import { cx, theme } from "@/app/_components/theme";
import { analyzeBrainHealth, nodeProvenance, type BrainSourceSystem } from "@/domain";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { ApprovalQueue } from "./approval-queue";
import { BrainBrowser } from "./brain-browser";
import { BrainHealth } from "./brain-health";
import { BrainQuickSwitcher } from "./brain-quick-switcher";
import { BrainRecallTester } from "./brain-recall-tester";
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

type Tab = "web" | "health" | "recall" | "recent" | "review" | "facts";

function matchesSource(node: BrainNode, filter: SourceFilter): boolean {
  if (filter === "all") return true;
  return nodeProvenance(node).system === filter;
}

// Wrapped so the wall-clock read isn't a bare impure call inside render/useMemo.
function nowMs(): number {
  return Date.now();
}

export function BrainShell({ graphNodes, graphEdges, allNodes, proposedNodes, agentName }: Props) {
  const [source, setSource] = useState<SourceFilter>("all");
  const [tab, setTab] = useState<Tab>("web");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const hub = graphNodes.find((n) => n.kind === "arc" || n.kind === "hub");
    if (hub) return hub.id;
    // No hub: open on the most-connected fact as a natural, brand-agnostic entry point.
    const deg = new Map<string, number>();
    for (const e of graphEdges) {
      deg.set(e.fromNodeId, (deg.get(e.fromNodeId) ?? 0) + 1);
      deg.set(e.toNodeId, (deg.get(e.toNodeId) ?? 0) + 1);
    }
    let best = graphNodes[0]?.id ?? null;
    let bestDeg = -1;
    for (const n of graphNodes) {
      const d = deg.get(n.id) ?? 0;
      if (d > bestDeg) { bestDeg = d; best = n.id; }
    }
    return best;
  });

  const filteredGraphNodes = useMemo(() => graphNodes.filter((n) => matchesSource(n, source)), [graphNodes, source]);
  const filteredGraphIds = useMemo(() => new Set(filteredGraphNodes.map((n) => n.id)), [filteredGraphNodes]);
  const filteredEdges = useMemo(
    () => graphEdges.filter((e) => filteredGraphIds.has(e.fromNodeId) && filteredGraphIds.has(e.toNodeId)),
    [graphEdges, filteredGraphIds],
  );
  const filteredAll = useMemo(() => allNodes.filter((n) => matchesSource(n, source)), [allNodes, source]);
  const filteredProposed = useMemo(() => proposedNodes.filter((n) => matchesSource(n, source)), [proposedNodes, source]);

  // Health is a whole-brain concern — computed over the full graph, not the filter.
  const health = useMemo(() => analyzeBrainHealth(graphNodes, graphEdges, nowMs()), [graphNodes, graphEdges]);
  const healthIssues = health.orphans.length + health.coverageGaps.length + health.lowConfidence.length + health.stale.length;

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "web", label: "Knowledge Web", count: filteredGraphNodes.length },
    { key: "health", label: "Health", count: healthIssues },
    { key: "recall", label: "Ask Arc" },
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
              className={cx(
                theme.control.tabBase,
                // Clean filled active state — no gold underline marker.
                active ? cx(theme.control.tabActive, "bg-[var(--surface-inset)]") : theme.control.tabIdle,
              )}
            >
              <span className="truncate text-sm font-bold text-current">{t.label}</span>
              {t.count !== undefined ? (
                <span className={cx(theme.control.tabBadge, active ? "text-[var(--accent)]" : "")}>{t.count}</span>
              ) : null}
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
      {tab === "health" && <BrainHealth health={health} onSelect={jumpTo} />}
      {tab === "recall" && <BrainRecallTester nodes={graphNodes} edges={graphEdges} agentName={agentName} onSelect={jumpTo} />}
      {tab === "recent" && <RecentlyLearned nodes={filteredAll} />}
      {tab === "review" && <ApprovalQueue nodes={filteredProposed} />}
      {tab === "facts" && <BrainBrowser nodes={filteredAll} agentName={agentName} />}

      <BrainQuickSwitcher nodes={graphNodes} onSelect={jumpTo} />
    </div>
  );
}
