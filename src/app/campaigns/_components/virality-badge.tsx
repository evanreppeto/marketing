"use client";

import type { CampaignMediaAsset } from "@/lib/campaigns/read-model";

/** Score chip for a media asset. Video → virality prediction (viral/hook/retention);
 *  image → a distinct "Creative check" chip so a quality proxy is never read as a
 *  virality prediction. Follows DESIGN.md (charcoal/red, hairlines, no emoji). */
export function ViralityBadge({ media }: { media: CampaignMediaAsset }) {
  const v = media.virality;
  if (!v) return null;

  if (v.kind === "proxy") {
    return (
      <span
        title={`Creative check — ${v.factors.join(", ")}. ${v.disclaimer}`}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]"
      >
        Creative check · {v.qualityScore}
      </span>
    );
  }

  const weakHook = v.hookScore < 40;
  return (
    <span
      title={`Predicted virality ${v.viralPotential}/100 · hook ${v.hookScore} · retention ${v.sustain}. ${v.disclaimer}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
        weakHook
          ? "border-[var(--accent)] text-[var(--accent)]"
          : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-muted)]"
      }`}
    >
      Virality {v.viralPotential}
      <span className="font-medium normal-case tracking-normal">· hook {v.hookScore}</span>
    </span>
  );
}

/** Sort key for best-first ordering: predicted by viralPotential, proxy by quality. */
export function viralityRank(media: CampaignMediaAsset): number {
  const v = media.virality;
  if (!v) return -1;
  return v.kind === "predicted" ? v.viralPotential : v.qualityScore;
}
