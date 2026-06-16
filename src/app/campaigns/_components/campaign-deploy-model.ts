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
  readyCount: number; // pieces past review — deploy + share + already-deployed (everything except locked)
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

/** Assemble the clipboard text for a piece — Subject-prefixed for email, body otherwise. */
export function assembleCopyText(asset: CampaignWorkspaceAsset): string {
  const body = asset.body.trim() || asset.preview.trim() || "No content yet.";
  return contentWhere(asset) === "Email" ? `Subject: ${asset.title}\n\n${body}` : body;
}

/** Whether a channel can be deployed (its send connection is live). Email→any connected
 *  email connection; Social→any connected social connection; everything else is share-only. */
export function isChannelDeployable(channel: string, connections: ConnectionView[]): boolean {
  if (channel === "Email") return connections.some((c) => c.kind === "email" && c.status === "connected");
  if (channel === "Social") return connections.some((c) => c.kind === "social" && c.status === "connected");
  return false;
}

function copyLabelFor(channel: string): string {
  if (channel === "Social") return "Copy caption";
  return "Copy text";
}

function buildPiece(asset: CampaignWorkspaceAsset, launchState: CampaignLaunchState, connections: ConnectionView[]): DeployPiece {
  const channel = contentWhere(asset);
  const statusLabel = contentStatusForLaunch(asset, launchState).label;

  const connectable = channel === "Email" || channel === "Social";

  const emailConn = connections.find((c) => c.kind === "email" && c.status === "connected");
  const socialConn = connections.find((c) => c.kind === "social" && c.status === "connected");

  const connectionReady = channel === "Email" ? !!emailConn : channel === "Social" ? !!socialConn : false;

  let connectionLabel: string;
  if (channel === "Email") connectionLabel = emailConn ? `${emailConn.label} connected` : "Email not connected";
  else if (channel === "Social") connectionLabel = socialConn ? `${socialConn.label} connected` : "Social not connected";
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

  const copyText = assembleCopyText(asset);

  return {
    id: asset.id,
    title: asset.title,
    channel,
    statusLabel,
    mode,
    connectable,
    connectionReady,
    connectionLabel,
    previewText: asset.preview.trim() || asset.body.trim() || "No content yet.",
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

  // Declined/archived pieces do NOT block campaign deploy — only still-pending pieces do
  // (mirrors the launchCampaign backend, which deploys only the approved pieces).
  let deployCampaignBlockedReason: string | null = null;
  if (!launchLocked) {
    deployCampaignBlockedReason = "Campaign is already live";
  } else if (launchState.pendingCount > 0) {
    deployCampaignBlockedReason = `Approve every piece first — ${launchState.pendingCount} still pending`;
  } else if (launchState.approvedCount === 0) {
    deployCampaignBlockedReason = "Approve at least one piece first";
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
