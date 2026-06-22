import { theme } from "@/app/_components/theme";
import { computeGraphLayout, type GraphEdge, type GraphNode } from "@/domain";

const KIND_FILL: Record<GraphNode["kind"], string> = {
  note: "var(--accent)",
  record: "oklch(0.78 0.14 158)",
  persona: "oklch(0.82 0.13 85)",
  unresolved: "var(--text-muted)",
};

export function NoteGraph({
  nodes,
  edges,
  focusId,
  width = 520,
  height = 320,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusId: string;
  width?: number;
  height?: number;
}) {
  // Nothing to draw (e.g. an empty vault or a note with no links): render a
  // calm placeholder instead of an empty/!broken SVG.
  if (nodes.length === 0) {
    return (
      <div className={`${theme.surface.dashedEmpty} p-6 text-center text-sm text-[var(--text-muted)]`}>
        <div className="relative font-semibold text-[var(--text-primary)]">No links to graph yet</div>
        <p className="relative mt-1 text-xs leading-5 text-[var(--text-secondary)]">Link this note to records, personas, or other notes to build the graph.</p>
      </div>
    );
  }

  const placed = computeGraphLayout(nodes, focusId, width, height);
  const byId = new Map(placed.map((n) => [n.id, n]));

  return (
    <svg
      aria-label="Note link graph"
      className="h-auto w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)]"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      {edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        return (
          <line
            key={`${edge.from}-${edge.to}`}
            stroke="var(--border-strong)"
            strokeWidth={1}
            x1={from.x}
            x2={to.x}
            y1={from.y}
            y2={to.y}
          />
        );
      })}
      {placed.map((node) => {
        const isFocus = node.id === focusId;
        return (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} fill={KIND_FILL[node.kind]} r={isFocus ? 7 : 4.5} />
            <text
              fill="var(--text-secondary)"
              fontSize={11}
              fontWeight={isFocus ? 700 : 500}
              textAnchor="middle"
              x={node.x}
              y={node.y - 10}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
