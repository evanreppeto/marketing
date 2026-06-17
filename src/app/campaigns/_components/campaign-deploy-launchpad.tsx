"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, StatusPill, buttonClasses } from "@/app/_components/page-header";
import type { DispatchView } from "@/lib/dispatch/status";

import { deployAssetAction, launchCampaignAction } from "../actions";
import { DispatchPanel } from "./dispatch-panel";
import type { DeployLaunchpad, DeployPiece } from "./campaign-deploy-model";
import { CopyTextButton } from "./copy-text-button";

export function CampaignDeployLaunchpad({
  launchpad,
  dispatches,
  campaignId,
  agentName,
}: {
  launchpad: DeployLaunchpad;
  dispatches: DispatchView[];
  campaignId: string;
  agentName: string;
}) {
  const isEmpty = launchpad.totalShippable === 0;

  return (
    <section
      id="send-export"
      className="scroll-mt-5 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]"
    >
      <header className="flex flex-col gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            {isEmpty
              ? "Deploy & share"
              : `${launchpad.readyCount} of ${launchpad.totalShippable} piece${launchpad.totalShippable === 1 ? "" : "s"} ready to ship`}
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
            {isEmpty
              ? `No pieces to deploy yet. Once ${agentName} adds approved pieces, deploy or share them here — nothing sends until you click.`
              : `Deploy hands approved pieces to ${agentName} via the Outbox. Nothing sends until you click.`}
          </p>
        </div>
        {isEmpty ? null : <DeployCampaignButton campaignId={campaignId} launchpad={launchpad} agentName={agentName} />}
      </header>

      {isEmpty ? null : (
        <ul className="divide-y divide-[var(--border-hairline)]">
          {launchpad.pieces.map((piece) => (
            <li key={piece.id}>
              <DeployPieceRow piece={piece} campaignId={campaignId} />
            </li>
          ))}
        </ul>
      )}

      {launchpad.hasConnectableGap ? (
        <p className="border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)]">
          Some channels aren&apos;t connected — copy or download those pieces to use them manually, or{" "}
          <Link href="/settings#connections" className="font-semibold text-[var(--accent)] hover:underline">
            connect them in Settings
          </Link>
          .
        </p>
      ) : null}

      {dispatches.length > 0 ? (
        <div className="border-t border-[var(--border-hairline)] p-4">
          <DispatchPanel dispatches={dispatches} />
        </div>
      ) : null}
    </section>
  );
}

function DeployPieceRow({ piece, campaignId }: { piece: DeployPiece; campaignId: string }) {
  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={statusTone(piece)}>{piece.statusLabel}</StatusPill>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{piece.channel}</span>
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">&middot; {piece.connectionLabel}</span>
        </div>
        <div className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{piece.title}</div>
        <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-[var(--text-muted)]">{piece.previewText}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <PieceActions piece={piece} campaignId={campaignId} />
      </div>
    </div>
  );
}

function PieceActions({ piece, campaignId }: { piece: DeployPiece; campaignId: string }) {
  if (piece.mode === "locked") {
    return <span className="text-xs font-semibold text-[var(--text-muted)]">{piece.lockReason}</span>;
  }
  if (piece.mode === "deployed") {
    return (
      <>
        <StatusPill tone="blue">Queued in Outbox</StatusPill>
        <Link href="/outbox" className={buttonClasses({ variant: "ghost", size: "sm" })}>
          View Outbox
        </Link>
      </>
    );
  }
  return (
    <>
      {piece.mode === "deploy" ? <DeployPieceButton assetId={piece.id} campaignId={campaignId} /> : null}
      <CopyTextButton text={piece.copyText} label={piece.copyLabel} />
      {piece.mediaUrls.map((url, i) => (
        <a
          key={`${url}-${i}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          download
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          {piece.mediaUrls.length > 1 ? `Download ${i + 1}` : "Download media"}
        </a>
      ))}
    </>
  );
}

function DeployPieceButton({ assetId, campaignId }: { assetId: string; campaignId: string }) {
  const [state, formAction, isPending] = useActionState(deployAssetAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <Button type="submit" variant="primary" size="sm" disabled={isPending}>
        {isPending ? "Deploying…" : "Deploy"}
      </Button>
      {state ? <ActionMessage state={state} /> : null}
    </form>
  );
}

function DeployCampaignButton({
  campaignId,
  launchpad,
  agentName,
}: {
  campaignId: string;
  launchpad: DeployLaunchpad;
  agentName: string;
}) {
  const [state, formAction, isPending] = useActionState(launchCampaignAction, null);
  const [confirming, setConfirming] = useState(false);

  if (!launchpad.canDeployCampaign) {
    return (
      <div className="shrink-0 text-right">
        <Button type="button" variant="primary" size="sm" disabled>
          Deploy campaign
        </Button>
        <p className="mt-1 text-[11px] font-semibold text-[var(--text-muted)]">{launchpad.deployCampaignBlockedReason}</p>
      </div>
    );
  }

  if (!confirming) {
    return (
      <Button type="button" variant="primary" size="sm" className="shrink-0" onClick={() => setConfirming(true)}>
        Deploy campaign
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end gap-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <p className="text-xs font-semibold text-[var(--text-secondary)]">
        Hand {launchpad.readyCount} approved piece{launchpad.readyCount === 1 ? "" : "s"} to {agentName} to send?
      </p>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={isPending}>
          {isPending ? "Deploying…" : "Confirm deploy"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
      {state ? <ActionMessage state={state} /> : null}
    </form>
  );
}

function ActionMessage({ state }: { state: { ok: boolean; message: string } }) {
  return (
    <span className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--warn-text)]"}`}>
      {state.message}
    </span>
  );
}

function statusTone(piece: DeployPiece): "amber" | "blue" | "green" | "gray" | "red" {
  if (piece.statusLabel === "Live") return "green";
  if (piece.statusLabel === "Ready") return "blue";
  if (piece.statusLabel === "Review") return "amber";
  if (piece.statusLabel === "Blocked") return "red";
  return "gray";
}
