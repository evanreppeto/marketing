"use client";

import { useState, useTransition } from "react";

import { useAgentName } from "@/app/_components/agent-name-context";
import { Panel, StatusPill } from "@/app/_components/page-header";
import { approveNodeAction, rejectNodeAction } from "@/app/brain/actions";
import { type BrainNode } from "@/lib/knowledge-graph/read-model";

export function ApprovalQueue({ nodes }: { nodes: BrainNode[] }) {
  const agentName = useAgentName();
  const [items, setItems] = useState(nodes);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <Panel>
        <h2 className="mb-3 text-sm font-medium text-[var(--text-muted)]">
          Approval queue
        </h2>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          Nothing waiting. Brand facts {agentName} proposes will appear here for review before they are trusted.
        </p>
      </Panel>
    );
  }

  function decide(id: string, decision: "approve" | "reject") {
    startTransition(async () => {
      const action = decision === "approve" ? approveNodeAction : rejectNodeAction;
      const result = await action(id);
      if (result.ok) setItems((prev) => prev.filter((n) => n.id !== id));
    });
  }

  return (
    <Panel>
      <h2 className="mb-3 text-sm font-medium text-[var(--text-muted)]">
        Approval queue
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((node) => (
          <li key={node.id} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                {node.kind}
              </span>
              <StatusPill tone="amber">proposed</StatusPill>
            </div>
            <p className="mt-1 font-semibold text-[var(--text-primary)]">{node.label}</p>
            {node.body ? (
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{node.body}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => decide(node.id, "approve")}
                className="rounded-md border border-[var(--ok-border)] bg-[var(--ok-solid)] px-3 py-1.5 text-sm font-semibold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)] disabled:pointer-events-none disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide(node.id, "reject")}
                className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-1.5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-raised)] disabled:pointer-events-none disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
