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
const resendNotConfigured = [connection({ provider: "resend", kind: "email", status: "not_configured" as ConnectionView["status"] })];

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
      connections: resendNotConfigured,
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

  it("copyText falls back to preview when body is empty", () => {
    const result = buildDeployLaunchpad({
      assets: [makeAsset({ body: "", preview: "Preview only", channel: "sms", assetType: "SMS" })],
      launchState: makeLaunchState(),
      launchLocked: true,
      connections: emailConnected,
    });
    expect(result.pieces[0].copyText).toBe("Preview only");
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
