# Campaign Deploy & Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Deploy & Share" launchpad to the individual campaign page so an operator can ship one approved piece or the whole campaign, with per-channel hybrid behavior (connected → hand off to Mark via Outbox; not connected → copy/download).

**Architecture:** A new pure, unit-tested model (`buildDeployLaunchpad`) turns the existing campaign workspace detail + connection statuses into a serializable view. A new client component renders it, reusing the existing `deployAssetAction` / `launchCampaignAction` server actions and the `DispatchPanel` Outbox strip. The page fetches connections + dispatches and passes them down. No new backend, no new outbound behavior — deploy is an operator-gated hand-off.

**Tech Stack:** Next.js 16 (App Router, RSC + `useActionState` client islands), React 19, TypeScript, Vitest, Tailwind with the project's CSS-variable design tokens.

**Design reference:** `docs/superpowers/specs/2026-06-16-campaign-deploy-share-design.md`

---

## Context an implementer needs

- **Read the spec first** (path above). It has the full channel→action matrix and the non-negotiable: the app never sends autonomously — "deploy" unlocks a piece, queues it in the Outbox, and records a handoff event Mark/Hermes executes. The operator's click is the human approval.
- **Existing server actions (reuse, do not modify)** in `src/app/campaigns/actions.ts`:
  - `deployAssetAction(prev, formData)` — fields `assetId`, `campaignId`. Returns `{ ok, message } | null`.
  - `launchCampaignAction(prev, formData)` — field `campaignId`. Returns `{ ok, message } | null`.
  - `reopenAssetAction(prev, formData)` — fields `assetId`, `campaignId`.
- **Pure helpers to reuse** from `src/app/campaigns/_components/campaign-detail-model.ts`:
  - `contentWhere(asset)` → `"Email" | "SMS" | "Social" | "Website" | "Export" | "CRM"`.
  - `contentStatusForLaunch(asset, launchState)` → `{ label: "Review" | "Ready" | "Live" | "Draft" | "Blocked"; tone }`. `"Ready"` = approved but not yet deployed (deployable); `"Live"` = already deployed.
- **Types** (`src/lib/campaigns/read-model.ts`): `CampaignWorkspaceAsset` (`id`, `title`, `channel`, `assetType`, `status`, `body`, `preview`, `dispatchLocked`, `media: CampaignMediaAsset[]`, `approval`), `CampaignMediaAsset` (`id`, `type`, `title`, `url`, `thumbnailUrl`, `mimeType`), `CampaignLaunchState` (`requiredCount`, `approvedCount`, `pendingCount`, `deployedCount`, `ready`, `live`, `lifecycle`), `LiveCampaignWorkspace` (`assets`, `launchState`, `campaign.launchLocked`).
- **Connections** (`src/lib/connections/read-model.ts`): `getConnections(): Promise<ConnectionView[]>`. `ConnectionView` has `provider` (`"resend" | "instagram" | "facebook" | "linkedin" | "x"`), `kind` (`"email" | "social"`), `status`. A connection is usable when `status === "connected"`. Degrades gracefully without Supabase.
- **Dispatches** (`src/lib/dispatch/read-model.ts`): `getCampaignDispatches(campaignId): Promise<DispatchView[]>`. Render with the existing `DispatchPanel` (`src/app/campaigns/_components/dispatch-panel.tsx`).
- **UI primitives** (`src/app/_components/page-header.tsx`): `Button` (variants `primary | priority | ghost | approve`, sizes `sm | md`, passes through button attrs), `buttonClasses({ variant, size, className })` for `<Link>`/`<a>`, `StatusPill` (`tone`, children).
- **Design rules** (`DESIGN.md`): warm near-black surfaces, antique-gold primary (`--accent`), `StatusPill` tones, no side-stripe accent borders, no nested cards, no hover levitation, no emojis. Use the canonical `Button`/`buttonClasses` — never hand-roll button classes.
- **Commands:** `pnpm test <file>` (vitest one-shot), `pnpm build` (types — lint does NOT typecheck), `pnpm lint` (scope to changed files; the repo reports ~31k vendor lint problems otherwise).

## File structure

**New**
- `src/app/campaigns/_components/campaign-deploy-model.ts` — pure: `buildDeployLaunchpad` + exported types.
- `src/app/campaigns/_components/__tests__/campaign-deploy-model.test.ts` — unit tests for the model.
- `src/app/campaigns/_components/copy-text-button.tsx` — client clipboard button.
- `src/app/campaigns/_components/campaign-deploy-launchpad.tsx` — client section component.

**Modified**
- `src/app/campaigns/[campaignId]/page.tsx` — fetch connections + dispatches, pass down.
- `src/app/campaigns/_components/campaign-simple-detail.tsx` — mount the launchpad; accept new props.
- `src/app/campaigns/_components/campaign-package-workspace.tsx` — replace the dead-end "moved past review" text with an inline Deploy/Share shortcut.

---

## Task 1: Pure model — `buildDeployLaunchpad`

**Files:**
- Create: `src/app/campaigns/_components/campaign-deploy-model.ts`
- Test: `src/app/campaigns/_components/__tests__/campaign-deploy-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/campaigns/_components/__tests__/campaign-deploy-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { CampaignWorkspaceAsset, CampaignLaunchState } from "@/lib/campaigns/read-model";
import type { ConnectionView } from "@/lib/connections/read-model";

import { buildDeployLaunchpad } from "../campaign-deploy-model";

function makeAsset(partial: Partial<CampaignWorkspaceAsset>): CampaignWorkspaceAsset {
  return {
    id: "a1",
    title: "Welcome email",
    assetType: "Email",
    category: "messaging" as CampaignWorkspaceAsset["category"],
    channel: "email",
    status: "approved",
    body: "Hello there",
    preview: "Hello there preview",
    complianceNotes: "",
    dispatchLocked: true,
    toolSource: null,
    updatedAt: "2026-06-16",
    media: [],
    revision: null,
    approval: { id: "ap1", status: "approved" },
    ...partial,
  };
}

function makeLaunchState(partial: Partial<CampaignLaunchState> = {}): CampaignLaunchState {
  return {
    requiredCount: 1,
    approvedCount: 1,
    pendingCount: 0,
    deployedCount: 0,
    ready: true,
    live: false,
    lifecycle: "Ready",
    ...partial,
  };
}

function connection(partial: Partial<ConnectionView>): ConnectionView {
  return {
    provider: "resend",
    kind: "email",
    label: "Resend",
    envVar: null,
    requiredEnvVars: [],
    enabled: true,
    status: "connected",
    fromEmail: null,
    lastTestedAt: null,
    lastTestOk: null,
    lastTestError: null,
    lastUsedAt: null,
    ...partial,
  };
}

const emailConnected = [connection({ provider: "resend", kind: "email", status: "connected" })];
const nothingConnected = [connection({ provider: "resend", kind: "email", status: "needs_setup" as ConnectionView["status"] })];

describe("buildDeployLaunchpad", () => {
  it("approved email with Resend connected is deployable (mode 'deploy')", () => {
    const result = buildDeployLaunchpad({
      assets: [makeAsset({ channel: "email", dispatchLocked: true, status: "approved" })],
      launchState: makeLaunchState(),
      launchLocked: true,
      connections: emailConnected,
    });
    expect(result.pieces[0].mode).toBe("deploy");
    expect(result.pieces[0].connectionReady).toBe(true);
    expect(result.pieces[0].connectionLabel).toBe("Resend connected");
  });

  it("approved email with no connection falls back to share", () => {
    const result = buildDeployLaunchpad({
      assets: [makeAsset({ channel: "email", dispatchLocked: true, status: "approved" })],
      launchState: makeLaunchState(),
      launchLocked: true,
      connections: nothingConnected,
    });
    expect(result.pieces[0].mode).toBe("share");
    expect(result.pieces[0].connectable).toBe(true);
    expect(result.pieces[0].connectionLabel).toBe("Email not connected");
  });

  it("SMS is always share-only (not connectable, no missing-connection note)", () => {
    const result = buildDeployLaunchpad({
      assets: [makeAsset({ channel: "sms", assetType: "SMS", dispatchLocked: true, status: "approved" })],
      launchState: makeLaunchState(),
      launchLocked: true,
      connections: emailConnected,
    });
    expect(result.pieces[0].mode).toBe("share");
    expect(result.pieces[0].connectable).toBe(false);
    expect(result.pieces[0].connectionLabel).toBe("No SMS connection");
  });

  it("pending piece is locked with a reason", () => {
    const result = buildDeployLaunchpad({
      assets: [makeAsset({ status: "pending", approval: { id: "ap1", status: "pending" } })],
      launchState: makeLaunchState({ approvedCount: 0, pendingCount: 1, ready: false, lifecycle: "In review" }),
      launchLocked: true,
      connections: emailConnected,
    });
    expect(result.pieces[0].mode).toBe("locked");
    expect(result.pieces[0].lockReason).toBe("Approve first");
  });

  it("already-deployed piece reports mode 'deployed'", () => {
    const result = buildDeployLaunchpad({
      assets: [makeAsset({ status: "approved", dispatchLocked: false })],
      launchState: makeLaunchState({ deployedCount: 1 }),
      launchLocked: true,
      connections: emailConnected,
    });
    expect(result.pieces[0].mode).toBe("deployed");
  });

  it("assembles copyText with subject + body for email", () => {
    const result = buildDeployLaunchpad({
      assets: [makeAsset({ title: "Storm follow-up", body: "Hi there", channel: "email" })],
      launchState: makeLaunchState(),
      launchLocked: true,
      connections: emailConnected,
    });
    expect(result.pieces[0].copyText).toBe("Subject: Storm follow-up\n\nHi there");
  });

  it("blocks campaign deploy while a piece is pending", () => {
    const result = buildDeployLaunchpad({
      assets: [makeAsset({ status: "pending", approval: { id: "ap1", status: "pending" } })],
      launchState: makeLaunchState({ approvedCount: 0, pendingCount: 1, ready: false }),
      launchLocked: true,
      connections: emailConnected,
    });
    expect(result.canDeployCampaign).toBe(false);
    expect(result.deployCampaignBlockedReason).toBe("Approve every piece first — 1 still pending");
  });

  it("enables campaign deploy when all pieces are decided and at least one approved", () => {
    const result = buildDeployLaunchpad({
      assets: [makeAsset({ status: "approved" })],
      launchState: makeLaunchState(),
      launchLocked: true,
      connections: emailConnected,
    });
    expect(result.canDeployCampaign).toBe(true);
    expect(result.deployCampaignBlockedReason).toBeNull();
    expect(result.readyCount).toBe(1);
    expect(result.totalShippable).toBe(1);
  });

  it("reports campaign already live when launch is unlocked", () => {
    const result = buildDeployLaunchpad({
      assets: [makeAsset({ status: "approved", dispatchLocked: false })],
      launchState: makeLaunchState({ live: true, deployedCount: 1, lifecycle: "Live" }),
      launchLocked: false,
      connections: emailConnected,
    });
    expect(result.canDeployCampaign).toBe(false);
    expect(result.deployCampaignBlockedReason).toBe("Campaign is already live");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/campaigns/_components/__tests__/campaign-deploy-model.test.ts`
Expected: FAIL — `buildDeployLaunchpad` is not exported / module not found.

- [ ] **Step 3: Write the model**

Create `src/app/campaigns/_components/campaign-deploy-model.ts`:

```ts
import type { CampaignLaunchState, CampaignWorkspaceAsset } from "@/lib/campaigns/read-model";
import type { ConnectionView } from "@/lib/connections/read-model";

import { contentStatusForLaunch, contentWhere, type PlainStatus } from "./campaign-detail-model";

export type DeployPieceMode = "deploy" | "share" | "locked" | "deployed";

export type DeployPiece = {
  id: string;
  title: string;
  channel: string; // contentWhere(): Email | SMS | Social | Website | Export | CRM
  statusLabel: PlainStatus["label"];
  mode: DeployPieceMode;
  /** Whether this channel can ever be a send channel (Email, Social). Drives the
   *  "connect it in Settings" note — false for inherently share-only channels. */
  connectable: boolean;
  connectionReady: boolean;
  connectionLabel: string;
  previewText: string;
  mediaUrls: string[];
  copyText: string;
  copyLabel: string;
  lockReason: string | null;
};

export type DeployLaunchpad = {
  readyCount: number; // approved pieces (deploy + share + deployed)
  totalShippable: number; // total pieces
  canDeployCampaign: boolean;
  deployCampaignBlockedReason: string | null;
  /** True when any approved-but-unconnected piece is on a connectable channel —
   *  drives the single Settings note. */
  hasConnectableGap: boolean;
  pieces: DeployPiece[];
};

export type BuildDeployLaunchpadInput = {
  assets: CampaignWorkspaceAsset[];
  launchState: CampaignLaunchState;
  launchLocked: boolean;
  connections: ConnectionView[];
};

function emailReady(connections: ConnectionView[]): boolean {
  return connections.some((c) => c.kind === "email" && c.status === "connected");
}

function socialReady(connections: ConnectionView[]): boolean {
  return connections.some((c) => c.kind === "social" && c.status === "connected");
}

function copyLabelFor(channel: string): string {
  if (channel === "Social") return "Copy caption";
  return "Copy text";
}

function buildPiece(asset: CampaignWorkspaceAsset, launchState: CampaignLaunchState, connections: ConnectionView[]): DeployPiece {
  const channel = contentWhere(asset);
  const statusLabel = contentStatusForLaunch(asset, launchState).label;

  const connectable = channel === "Email" || channel === "Social";
  const connectionReady = channel === "Email" ? emailReady(connections) : channel === "Social" ? socialReady(connections) : false;

  let connectionLabel: string;
  if (channel === "Email") connectionLabel = connectionReady ? "Resend connected" : "Email not connected";
  else if (channel === "Social") connectionLabel = connectionReady ? "Social connected" : "Social not connected";
  else if (channel === "SMS") connectionLabel = "No SMS connection";
  else connectionLabel = "Copy or download";

  let mode: DeployPieceMode;
  let lockReason: string | null = null;
  if (statusLabel === "Live") {
    mode = "deployed";
  } else if (statusLabel === "Ready") {
    mode = connectable && connectionReady ? "deploy" : "share";
  } else {
    mode = "locked";
    lockReason = statusLabel === "Blocked" ? "Needs rework" : "Approve first";
  }

  const body = asset.body.trim() || asset.preview.trim();
  const copyText = channel === "Email" ? `Subject: ${asset.title}\n\n${body}` : body;

  return {
    id: asset.id,
    title: asset.title,
    channel,
    statusLabel,
    mode,
    connectable,
    connectionReady,
    connectionLabel,
    previewText: asset.preview.trim() || body,
    mediaUrls: asset.media.filter((m) => m.type === "image" || m.type === "video" || m.type === "file").map((m) => m.url),
    copyText,
    copyLabel: copyLabelFor(channel),
    lockReason,
  };
}

/**
 * Pure view-model for the campaign "Deploy & Share" launchpad. Maps each piece to
 * an action mode (deploy / share / locked / deployed) using its approval status and
 * its channel's connection readiness, and derives the campaign-level deploy gate.
 * No I/O — the page supplies assets, launch state, and connection statuses.
 */
export function buildDeployLaunchpad(input: BuildDeployLaunchpadInput): DeployLaunchpad {
  const { assets, launchState, launchLocked, connections } = input;
  const pieces = assets.map((asset) => buildPiece(asset, launchState, connections));

  const readyCount = pieces.filter((p) => p.mode !== "locked").length;

  let deployCampaignBlockedReason: string | null = null;
  if (!launchLocked) {
    deployCampaignBlockedReason = "Campaign is already live";
  } else if (launchState.approvedCount === 0) {
    deployCampaignBlockedReason = "Approve at least one piece first";
  } else if (launchState.pendingCount > 0) {
    deployCampaignBlockedReason = `Approve every piece first — ${launchState.pendingCount} still pending`;
  }

  return {
    readyCount,
    totalShippable: pieces.length,
    canDeployCampaign: deployCampaignBlockedReason === null,
    deployCampaignBlockedReason,
    hasConnectableGap: pieces.some((p) => p.mode === "share" && p.connectable && !p.connectionReady),
    pieces,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/campaigns/_components/__tests__/campaign-deploy-model.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm build`
Expected: build completes without type errors. (If `ConnectionView["status"]` literal in the test mismatches the real union, replace `"needs_setup"` with a valid non-`"connected"` status from `src/domain/connections.ts` `ConnectionStatus`.)

- [ ] **Step 6: Commit**

```bash
git add src/app/campaigns/_components/campaign-deploy-model.ts src/app/campaigns/_components/__tests__/campaign-deploy-model.test.ts
git commit -m "feat(campaigns): pure deploy-launchpad view-model"
```

---

## Task 2: Clipboard button client island

**Files:**
- Create: `src/app/campaigns/_components/copy-text-button.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/campaigns/_components/copy-text-button.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/app/_components/page-header";

/**
 * Copy arbitrary text to the clipboard with a transient "Copied" confirmation.
 * Client-only — touches nothing external. Falls back to a select-and-prompt hint
 * when the Clipboard API is unavailable (e.g. insecure context / denied permission).
 */
export function CopyTextButton({ text, label = "Copy text", size = "sm" }: { text: string; label?: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Button type="button" variant="ghost" size={size} onClick={copy} aria-live="polite">
      {copied ? "Copied" : failed ? "Press Ctrl/Cmd+C" : label}
    </Button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: builds without type errors. (Confirm `Button` accepts `onClick`/`type="button"` — it forwards button attrs; `decision-controls.tsx` uses it similarly.)

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/copy-text-button.tsx
git commit -m "feat(campaigns): clipboard copy button"
```

---

## Task 3: Deploy & Share launchpad component

**Files:**
- Create: `src/app/campaigns/_components/campaign-deploy-launchpad.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/campaigns/_components/campaign-deploy-launchpad.tsx`:

```tsx
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
  if (launchpad.totalShippable === 0) return null;

  return (
    <section
      id="send-export"
      className="scroll-mt-5 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]"
    >
      <header className="flex flex-col gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="signal-eyebrow">Deploy &amp; share</div>
          <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)]">
            {launchpad.readyCount} of {launchpad.totalShippable} piece{launchpad.totalShippable === 1 ? "" : "s"} ready to ship
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
            Deploy hands approved pieces to {agentName} via the Outbox. Nothing sends until you click.
          </p>
        </div>
        <DeployCampaignButton campaignId={campaignId} launchpad={launchpad} agentName={agentName} />
      </header>

      <ul className="divide-y divide-[var(--border-hairline)]">
        {launchpad.pieces.map((piece) => (
          <li key={piece.id}>
            <DeployPieceRow piece={piece} campaignId={campaignId} />
          </li>
        ))}
      </ul>

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
          key={url}
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: builds without type errors. (Confirm `--ok-text` / `--warn-text` exist — they're used in `campaign-package-workspace.tsx` `metricToneClass` and `connection-controls`. If `Button` lacks a `className` prop, wrap with a `<div className="shrink-0">` instead of passing `className`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/campaign-deploy-launchpad.tsx
git commit -m "feat(campaigns): deploy & share launchpad component"
```

---

## Task 4: Wire the launchpad into the page

**Files:**
- Modify: `src/app/campaigns/[campaignId]/page.tsx`
- Modify: `src/app/campaigns/_components/campaign-simple-detail.tsx`

- [ ] **Step 1: Fetch connections + dispatches in the page**

In `src/app/campaigns/[campaignId]/page.tsx`, add imports near the existing imports:

```tsx
import { getConnections } from "@/lib/connections/read-model";
import { getCampaignDispatches } from "@/lib/dispatch/read-model";
```

Replace the detail fetch block (currently lines ~17-20) so connections + dispatches are fetched and passed through:

```tsx
  const { campaignId } = await params;
  const { assistantName } = await getAppSettings();
  const agentName = getAgentDisplayName(assistantName);
  const [detail, connections, dispatches] = await Promise.all([
    getCampaignWorkspaceDetail(campaignId, undefined, agentName),
    getConnections(),
    getCampaignDispatches(campaignId),
  ]);
```

Update the final return to pass the new props:

```tsx
  return <CampaignSimpleDetail detail={detail} agentName={agentName} connections={connections} dispatches={dispatches} />;
```

- [ ] **Step 2: Accept and use the new props in the detail component**

In `src/app/campaigns/_components/campaign-simple-detail.tsx`:

Add imports at the top with the other component imports:

```tsx
import type { ConnectionView } from "@/lib/connections/read-model";
import type { DispatchView } from "@/lib/dispatch/status";

import { CampaignDeployLaunchpad } from "./campaign-deploy-launchpad";
import { buildDeployLaunchpad } from "./campaign-deploy-model";
```

Change the component signature and build the launchpad model:

```tsx
export function CampaignSimpleDetail({
  detail,
  agentName,
  connections,
  dispatches,
}: {
  detail: LiveCampaignWorkspace;
  agentName: string;
  connections: ConnectionView[];
  dispatches: DispatchView[];
}) {
  const { campaign, executiveOverview, launchState, reasoning } = detail;
  const checklist = buildCampaignChecklist(detail, agentName);
  const facts = buildSendExportFacts(detail);
  const packageSummary = buildCampaignPackageSummary(detail);
  const launchpad = buildDeployLaunchpad({
    assets: detail.assets,
    launchState: detail.launchState,
    launchLocked: detail.campaign.launchLocked,
    connections,
  });
  const statusTone = lifecycleTone(launchState.lifecycle);
```

Mount the launchpad between the progress bar and the two-column grid (after the `<CampaignProgressBar … />` line):

```tsx
      <CampaignProgressBar checklist={checklist} />

      <CampaignDeployLaunchpad launchpad={launchpad} dispatches={dispatches} campaignId={campaign.id} agentName={agentName} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
```

- [ ] **Step 3: Typecheck + run model tests**

Run: `pnpm build`
Expected: builds without type errors.
Run: `pnpm test src/app/campaigns/_components/__tests__/campaign-deploy-model.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/[campaignId]/page.tsx src/app/campaigns/_components/campaign-simple-detail.tsx
git commit -m "feat(campaigns): mount deploy launchpad on campaign page"
```

---

## Task 5: Inline Deploy/Share shortcut in the review pane

**Files:**
- Modify: `src/app/campaigns/_components/campaign-package-workspace.tsx`

Goal: replace the dead-end *"This piece has already moved past review."* paragraph (lines ~185-189) with a compact inline Deploy/Share control, so review and shipping connect.

- [ ] **Step 1: Add imports**

At the top of `campaign-package-workspace.tsx`, add:

```tsx
import { useActionState } from "react";
import { Button } from "@/app/_components/page-header";
import { deployAssetAction } from "../actions";
import { CopyTextButton } from "./copy-text-button";
```

(`useMemo`/`useState` are already imported from `react`; add `useActionState` to that existing import instead of duplicating.)

- [ ] **Step 2: Replace the dead-end branch**

In `CampaignPiece`, the current `else` branch renders the "moved past review" paragraph. Replace that `else` branch with:

```tsx
        ) : (
          <InlineDeployShortcut asset={asset} campaignId={campaignId} status={status} />
        )}
```

- [ ] **Step 3: Add the shortcut component**

Add near the bottom of the file (above the helper functions):

```tsx
function InlineDeployShortcut({
  asset,
  campaignId,
  status,
}: {
  asset: CampaignWorkspaceAsset;
  campaignId: string;
  status: { label: string };
}) {
  const [state, formAction, isPending] = useActionState(deployAssetAction, null);
  const isLive = status.label === "Live";
  const channel = contentWhere(asset);
  const body = asset.body.trim() || asset.preview.trim();
  const copyText = channel === "Email" ? `Subject: ${asset.title}\n\n${body}` : body;

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {isLive ? "Deployed" : "Ready to ship"}
      </div>
      {isLive ? (
        <p className="text-xs font-semibold text-[var(--text-muted)]">
          This piece is queued in the Outbox. Manage it from the Deploy &amp; share section above.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <form action={formAction} className="flex items-center gap-2">
            <input type="hidden" name="assetId" value={asset.id} />
            <input type="hidden" name="campaignId" value={campaignId} />
            <Button type="submit" variant="primary" size="sm" disabled={isPending}>
              {isPending ? "Deploying…" : "Deploy this piece"}
            </Button>
          </form>
          <CopyTextButton text={copyText} label={channel === "Social" ? "Copy caption" : "Copy text"} />
          {state ? (
            <span className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--warn-text)]"}`}>
              {state.message}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
```

(`contentWhere` is already imported in this file. `CampaignWorkspaceAsset` is already imported.)

- [ ] **Step 4: Typecheck**

Run: `pnpm build`
Expected: builds without type errors.

- [ ] **Step 5: Lint the changed files**

Run: `pnpm lint src/app/campaigns/_components/campaign-package-workspace.tsx src/app/campaigns/_components/campaign-deploy-launchpad.tsx src/app/campaigns/_components/campaign-deploy-model.ts src/app/campaigns/_components/copy-text-button.tsx`
Expected: no errors in these files.

- [ ] **Step 6: Commit**

```bash
git add src/app/campaigns/_components/campaign-package-workspace.tsx
git commit -m "feat(campaigns): inline deploy/share shortcut in review pane"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test`
Expected: PASS, including the new `campaign-deploy-model.test.ts`.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: completes with no type errors.

- [ ] **Step 3: Manual smoke (requires Supabase env + a seeded campaign)**

Run: `pnpm seed:test-campaign` then `pnpm dev`, open a campaign at `/campaigns/<id>` and confirm:
- The "Deploy & share" section appears under the progress bar with one row per piece.
- A pending piece shows "Approve first"; "Deploy campaign" is disabled with the pending reason.
- After approving a piece (in the package workspace), it becomes `Ready` and shows a "Deploy" button (Email with Resend connected) or "Copy"/"Download" (unconnected/SMS/social).
- Clicking "Deploy" → success message; the piece flips to "Queued in Outbox"; it appears in the Outbox strip and at `/outbox`.
- With all pieces approved, "Deploy campaign" → confirm → success; pieces unlock.
- Without Supabase configured, the section still renders and Copy/Download work; Deploy shows the "Supabase isn't configured" message.

- [ ] **Step 4: Final commit (if any manual-fix tweaks were needed)**

```bash
git add -A
git commit -m "test(campaigns): verify deploy & share launchpad"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** Task 1 = hybrid per-channel model + campaign gate; Task 2 = copy; Task 3 = launchpad UI (console frame + per-piece, Outbox strip, Settings note, honest labels); Task 4 = page wiring (connections + dispatches); Task 5 = inline shortcut replacing the dead end. Deferred items (PDF, share links, SMS provider) are intentionally absent.
- **Reused, not rebuilt:** `deployAssetAction`, `launchCampaignAction`, `reopenAssetAction`, `getConnections`, `getCampaignDispatches`, `DispatchPanel`, `Button`/`StatusPill`/`buttonClasses`.
- **Type consistency:** `buildDeployLaunchpad(input)` takes one object everywhere it's called (Task 4). `DeployPiece.mode` values (`deploy`/`share`/`locked`/`deployed`) are the same in model and component. `CopyTextButton` prop is `label` in both call sites.
- **RSC boundary:** the page (server) passes only serializable data (`launchpad`, `dispatches`, strings) to `CampaignDeployLaunchpad` (client) — no functions crossing the boundary (see the project's RSC rule). Server actions are imported inside the client component, which is allowed.
```
