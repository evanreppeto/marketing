import Link from "next/link";

import { Panel, StatusPill } from "@/app/_components/page-header";
import { type ThemeTone } from "@/app/_components/theme";
import { type BrainNode } from "@/lib/knowledge-graph/read-model";

const TIER_TONE: Record<string, ThemeTone> = {
  trusted: "green",
  proposed: "amber",
  observed: "blue",
  rejected: "red",
  archived: "gray",
};

export function BrainBrowser({ nodes, agentName = "Arc" }: { nodes: BrainNode[]; agentName?: string }) {
  if (nodes.length === 0) {
    return (
      <Panel>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Brain</h2>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          The brain is empty. Run{" "}
          <code className="rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-1 font-mono text-xs text-[var(--text-primary)]">
            pnpm seed:brain
          </code>{" "}
          or let {agentName} start recording what it learns.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Brain ({nodes.length})
      </h2>
      <ul className="flex flex-col divide-y divide-[var(--border-hairline)]">
        {nodes.map((node) => (
          <li key={node.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {node.kind}
                </span>
                {node.persona ? (
                  <span className="text-xs text-[var(--text-muted)]">{node.persona}</span>
                ) : null}
              </div>
              <p className="truncate font-semibold text-[var(--text-primary)]">{node.label}</p>
              {node.body ? (
                <p className="truncate text-sm leading-6 text-[var(--text-secondary)]">{node.body}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatusPill tone={TIER_TONE[node.trustTier] ?? "blue"}>{node.trustTier}</StatusPill>
              {node.refTable && node.refId ? (
                <Link
                  href={`/crm/${node.refTable}/${node.refId}`}
                  className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
                >
                  linked record
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
