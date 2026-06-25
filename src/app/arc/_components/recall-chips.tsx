import { EvidenceChip } from "@/app/_components/evidence-chip";
import type { ArcRecall } from "@/domain";

/**
 * "Recalled from memory" row shown at the top of an Arc reply — proves Arc
 * reasoned from the brain, not from nothing. Each item links back to the Brain
 * when a source node is known. Hidden when empty.
 */
export function RecallChips({ items }: { items: ArcRecall[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Recalled from memory
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <EvidenceChip
            key={`${i}-${item.label}`}
            label={item.label}
            confidence={item.confidence}
            href={item.nodeId ? "/brain" : undefined}
          />
        ))}
      </div>
    </div>
  );
}
