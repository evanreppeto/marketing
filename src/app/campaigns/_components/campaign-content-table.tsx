"use client";

import { useActionState, useMemo, useState } from "react";

import { useAgentName } from "@/app/_components/agent-name-context";
import { Button, buttonClasses, StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceAsset, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

import { decideAssetAction, deployAssetAction, reopenAssetAction, requestRevisionAction } from "../actions";
import { buildCampaignContentRows, type CampaignContentRow } from "./campaign-detail-model";

export function CampaignContentTable({ detail }: { detail: LiveCampaignWorkspace }) {
  const agentName = useAgentName();
  const rows = useMemo(() => buildCampaignContentRows(detail, agentName), [detail, agentName]);
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const selectedAsset = selected ? detail.assets.find((asset) => asset.id === selected.id) ?? null : null;
  const previewId = "campaign-content-preview";

  if (rows.length === 0) {
    return (
      <section id="content" className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6">
        <span className="signal-eyebrow">Pieces</span>
        <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">{agentName} is still building</h2>
        <p className="mt-2 max-w-[64ch] text-sm leading-6 text-[var(--text-secondary)]">
          Emails, exports, CRM notes, ads, and other campaign pieces will appear here when they are ready for you.
        </p>
      </section>
    );
  }

  return (
    <section id="content" className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-4">
        <span className="signal-eyebrow">Pieces</span>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">Things {agentName} made</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
              Pick one, read it, then approve it or ask {agentName} to change it.
            </p>
          </div>
          <span className="font-mono text-xs font-bold text-[var(--text-muted)]">
            {rows.length} piece{rows.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="grid gap-px bg-[var(--border-hairline)] lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.84fr)]">
        <div className="min-w-0 bg-[var(--surface-panel)]">
          <div className="hidden grid-cols-[minmax(11rem,1.4fr)_8rem_7rem_minmax(9rem,1fr)] gap-3 border-b border-[var(--border-hairline)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] md:grid">
            <span>Piece</span>
            <span>Use it for</span>
            <span>Needs</span>
            <span>Next step</span>
          </div>
          <div className="divide-y divide-[var(--border-hairline)]">
            {rows.map((row) => (
              <ContentRowButton
                key={row.id}
                row={row}
                selected={row.id === selected?.id}
                previewId={previewId}
                onSelect={() => setSelectedId(row.id)}
              />
            ))}
          </div>
        </div>

        <div className="min-w-0 bg-[var(--surface-panel)]">
          {selected && selectedAsset ? <ContentPreview id={previewId} row={selected} asset={selectedAsset} campaignId={detail.campaign.id} /> : null}
        </div>
      </div>
    </section>
  );
}

function ContentRowButton({
  row,
  selected,
  previewId,
  onSelect,
}: {
  row: CampaignContentRow;
  selected: boolean;
  previewId: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-controls={previewId}
      className={`grid w-full min-w-0 gap-2 px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] md:grid-cols-[minmax(11rem,1.4fr)_8rem_7rem_minmax(9rem,1fr)] md:items-center md:gap-3 ${
        selected ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-panel)] hover:bg-[var(--surface-inset)]"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[var(--text-primary)]">{row.title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)] md:hidden">{row.description}</span>
      </span>
      <span className="flex items-center justify-between gap-3 md:block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] md:hidden">Use it for</span>
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{row.where}</span>
      </span>
      <span className="flex items-center justify-between gap-3 md:block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] md:hidden">Needs</span>
        <StatusPill tone={row.status.tone}>{row.status.label}</StatusPill>
      </span>
      <span className="flex items-start justify-between gap-3 md:block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] md:hidden">Next step</span>
        <span className="text-sm leading-5 text-[var(--text-secondary)]">{row.nextAction}</span>
      </span>
    </button>
  );
}

function ContentPreview({
  id,
  row,
  asset,
  campaignId,
}: {
  id: string;
  row: CampaignContentRow;
  asset: CampaignWorkspaceAsset;
  campaignId: string;
}) {
  const [copied, setCopied] = useState(false);
  const canApprove = row.status.label === "Review";
  const canDeploy = row.status.label === "Ready";
  const canRevise = row.status.label !== "Live";
  const canReopen = row.status.label === "Live";

  async function copyPreview() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(row.preview);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <aside id={id} className="sticky top-4 min-w-0 p-4" aria-label={`Preview for ${row.title}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Read this</span>
          <h3 className="mt-1 text-base font-bold text-[var(--text-primary)]">{row.title}</h3>
          <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{row.description}</p>
        </div>
        <StatusPill tone={row.status.tone}>{row.status.label}</StatusPill>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-3 py-2">
          <span className="text-xs font-bold text-[var(--text-muted)]">{row.where}</span>
          <button type="button" onClick={copyPreview} className={buttonClasses({ variant: "ghost", size: "sm" })}>
            {copied ? "Copied" : "Copy text"}
          </button>
        </div>
        <div className="max-h-[28rem] overflow-auto p-3">
          <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{row.preview}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {canApprove ? <ApprovePiece assetId={asset.id} campaignId={campaignId} /> : null}
        {canDeploy ? <DeployPiece assetId={asset.id} campaignId={campaignId} /> : null}
        {canRevise ? <RevisePiece assetId={asset.id} campaignId={campaignId} /> : null}
        {canReopen ? <ReopenPiece assetId={asset.id} campaignId={campaignId} /> : null}
      </div>
    </aside>
  );
}

function DeployPiece({ assetId, campaignId }: { assetId: string; campaignId: string }) {
  const [state, formAction, isPending] = useActionState(deployAssetAction, null);

  return (
    <form action={formAction} className="rounded-lg border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] p-3">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--accent-contrast)]">Ready to send or export this?</span>
        <Button type="submit" variant="primary" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Send / export"}
        </Button>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
        This prepares the piece for the connected send or export flow. Nothing goes out without a saved action.
      </p>
      {state ? <p className={`mt-2 text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>{state.message}</p> : null}
    </form>
  );
}

function ReopenPiece({ assetId, campaignId }: { assetId: string; campaignId: string }) {
  const agentName = useAgentName();
  const [state, formAction, isPending] = useActionState(reopenAssetAction, null);

  return (
    <form action={formAction} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Need to change this piece?</span>
        <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : `Ask ${agentName} to revise`}
        </Button>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Moves this piece back into review so {agentName} can make changes before it is used again.</p>
      {state ? <p className={`mt-2 text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>{state.message}</p> : null}
    </form>
  );
}

function ApprovePiece({ assetId, campaignId }: { assetId: string; campaignId: string }) {
  const [state, formAction, isPending] = useActionState(decideAssetAction, null);

  return (
    <form action={formAction} className="rounded-lg border border-[var(--ok-border-soft)] bg-[var(--ok-soft)] p-3">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="decision" value="approved" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--ok-text)]">Ready to use this piece?</span>
        <Button type="submit" variant="approve" size="sm" disabled={isPending}>
          {isPending ? "Approving..." : "Approve"}
        </Button>
      </div>
      {state ? <p className={`mt-2 text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>{state.message}</p> : null}
    </form>
  );
}

function RevisePiece({ assetId, campaignId }: { assetId: string; campaignId: string }) {
  const agentName = useAgentName();
  const [state, formAction, isPending] = useActionState(requestRevisionAction, null);

  return (
    <form action={formAction} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Ask {agentName} for changes</span>
        <textarea
          name="instruction"
          rows={3}
          placeholder={`Tell ${agentName} what should change.`}
          className="mt-2 w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
          {isPending ? "Sending..." : `Send to ${agentName}`}
        </Button>
        <span className="text-xs text-[var(--text-muted)]">Queues a revision. Nothing is sent to customers.</span>
      </div>
      {state ? <p className={`mt-2 text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>{state.message}</p> : null}
    </form>
  );
}
