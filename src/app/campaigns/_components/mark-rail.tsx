"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/page-header";

import { requestRevisionAction } from "../actions";

export type MarkRailContext = {
  persona: string;
  leadsCount: number;
  tools: string[];
  whyBuilt: string;
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
      <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
          <span className="font-display text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">Mark</span>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">Outbound locked</span>
        </div>

        <dl className="space-y-2.5 px-4 py-4 text-sm">
          <Row label="Persona" value={context.persona} />
          <Row label="Leads used" value={String(context.leadsCount)} />
          <Row label="Tools" value={context.tools.length > 0 ? context.tools.join(", ") : "—"} />
        </dl>

        <div className="border-t border-[var(--border-hairline)] px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Why Mark built this</div>
          <p className="mt-1.5 text-sm leading-6 text-[var(--text-secondary)]">{context.whyBuilt}</p>
        </div>
      </section>

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
                    {asset.title} · {asset.channel}
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
            {isPending ? "Sending to Mark…" : "Send to Mark"}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
