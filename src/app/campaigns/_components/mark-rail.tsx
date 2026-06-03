"use client";

import { useActionState } from "react";

import { IntelligencePanel } from "@/app/_components/intelligence-panel";
import { Button } from "@/app/_components/page-header";

import { requestRevisionAction } from "../actions";

export type MarkRailContext = {
  persona: string;
  leadsCount: number;
  assetsCount: number;
  approvalsCount: number;
  mediaCount: number;
  tools: string[];
  whyBuilt: string;
  recommendedAction: string;
  guardrailFlags: string[];
  evidence: Array<{ label: string; href?: string | null; detail?: string | null }>;
};

export function MarkRail({
  campaignId,
  assets,
  targetAssetId,
  onSelectAsset,
  context,
}: {
  campaignId: string;
  assets: Array<{ id: string; title: string; channel: string }>;
  targetAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
  context: MarkRailContext;
}) {
  const [state, formAction, isPending] = useActionState(requestRevisionAction, null);
  const hasAssets = assets.length > 0;

  return (
    <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
      <IntelligencePanel
        model={{
          title: "Campaign decision context",
          persona: context.persona,
          confidence: context.leadsCount > 0 ? "Evidence linked" : "Needs source records",
          journeyStage: "Campaign review",
          urgency: "Human gate",
          attentionReason: context.whyBuilt,
          nextBestAction: context.recommendedAction || "Review the creative, source evidence, and guardrails before approving any next step.",
          cta: "Trade partners: Become a Partner. Property managers: Request Vendor Packet. Homeowners: Call Now / Upload Photos.",
          messageAngle: "Fast restoration handoff, mitigation documentation, and coverage-neutral next-step clarity.",
          guardrailStatus: context.guardrailFlags.length > 0
            ? context.guardrailFlags.join(", ")
            : "Outbound locked. Mark can revise, but no send, publish, launch, or spend action is enabled here.",
          scores: [
            { label: "Leads", value: context.leadsCount, detail: "Linked audience records", tone: context.leadsCount > 0 ? "blue" : "gray" },
            { label: "Assets", value: context.assetsCount, detail: "Draft deliverables", tone: context.assetsCount > 0 ? "blue" : "gray" },
            { label: "Approvals", value: context.approvalsCount, detail: "Human-gate records", tone: context.approvalsCount > 0 ? "amber" : "green" },
            { label: "Media", value: context.mediaCount, detail: "Images, video, files", tone: context.mediaCount > 0 ? "blue" : "gray" },
            { label: "Tools", value: context.tools.length, detail: context.tools.length > 0 ? context.tools.join(", ") : "No tools recorded", tone: context.tools.length > 0 ? "blue" : "gray" },
          ],
          proofPoints: [
            ...context.tools.map((tool) => `${tool} used by Mark`),
            ...context.guardrailFlags.map((flag) => `Guardrail: ${flag}`),
          ].slice(0, 8),
          evidence: context.evidence.slice(0, 6),
          actions: [
            { label: "Review approvals", href: "/approvals", variant: "primary" },
            { label: "Open performance", href: "/reports?tab=campaigns", variant: "ghost" },
          ],
          outboundLocked: true,
        }}
      />

      <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
          <div className="font-bold text-[var(--text-primary)]">Ask Mark to revise</div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">Creates a revision request. Nothing is sent.</p>
        </div>

        <form action={formAction} className="space-y-3 px-4 py-4">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="assetId" value={targetAssetId ?? ""} />

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Target asset</span>
            <select
              value={targetAssetId ?? ""}
              onChange={(event) => onSelectAsset(event.target.value)}
              disabled={!hasAssets}
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
            >
              {hasAssets ? (
                assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.title} / {asset.channel}
                  </option>
                ))
              ) : (
                <option value="">No assets to revise</option>
              )}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Instruction</span>
            <textarea
              name="instruction"
              rows={4}
              placeholder="e.g. Make the email shorter and add a referral CTA."
              disabled={!hasAssets}
              className="w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
            />
          </label>

          <Button type="submit" variant="primary" size="sm" disabled={!hasAssets || isPending} className="w-full">
            {isPending ? "Creating revision request..." : "Request Mark revision"}
          </Button>

          {state ? (
            <p
              className={`rounded-lg border px-3 py-2 text-sm ${
                state.ok
                  ? "border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]"
                  : "border-[oklch(0.68_0.2_26/0.45)] bg-[oklch(0.68_0.2_26/0.14)] text-[oklch(0.86_0.09_26)]"
              }`}
            >
              {state.message}
            </p>
          ) : null}
        </form>
      </section>
    </aside>
  );
}
