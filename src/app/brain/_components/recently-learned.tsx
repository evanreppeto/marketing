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

// Restrained kind hues — kept in lockstep with the graph's palette so a node's
// dot reads the same here as in the node-web.
const KIND_COLOR: Record<string, string> = {
  brand_fact: "#d05038",
  persona: "#b08755",
  segment: "#5d8a4f",
  service: "#3a72b0",
  proof_point: "#8a78c0",
  messaging_angle: "#d08a2c",
  cta: "#dc6a3a",
  asset_ref: "#2f93b8",
  learning: "#4f9a8a",
  signal: "#b3604a",
  crm_ref: "#6b7d8f",
  campaign_ref: "#5878a8",
  other: "#7a828f",
};
const kindColor = (kind: string): string => KIND_COLOR[kind] ?? "#7a828f";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

/**
 * "Recently learned" timeline — the most recent nodes the brain recorded, newest
 * first, color-coded by kind with trust state. Mirrors the bottom strip of the
 * Brain concept so the page shows momentum, not just a static graph.
 */
export function RecentlyLearned({ nodes }: { nodes: BrainNode[] }) {
  const recent = [...nodes]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 8);

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Recently learned</h2>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{recent.length} latest</span>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          Nothing recorded yet. As Arc learns, new facts land here newest-first.
        </p>
      ) : (
        <ol className="relative flex flex-col">
          {recent.map((node, i) => (
            <li key={node.id} className="flex gap-3 pb-3 last:pb-0">
              {/* Timeline rail: dot + connector */}
              <div className="relative flex w-3 shrink-0 justify-center">
                {i < recent.length - 1 ? (
                  <span aria-hidden className="absolute top-3 bottom-0 w-px bg-[var(--border-hairline)]" />
                ) : null}
                <span
                  aria-hidden
                  className="relative z-10 mt-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface-panel)]"
                  style={{ backgroundColor: kindColor(node.kind) }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {node.kind.replace(/_/g, " ")}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
                    {timeAgo(node.createdAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-[var(--text-primary)]">{node.label}</p>
                  <StatusPill tone={TIER_TONE[node.trustTier] ?? "gray"}>{node.trustTier}</StatusPill>
                </div>
                {node.summary || node.body ? (
                  <p className="mt-0.5 truncate text-sm leading-6 text-[var(--text-secondary)]">
                    {node.summary ?? node.body}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
