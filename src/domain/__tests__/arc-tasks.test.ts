import { describe, expect, it } from "vitest";

import {
  type NormalizeTaskInput,
  canOperatorMoveTask,
  nextAllowedActions,
  normalizeAgentTask,
  resolveStatusFilter,
  statusToSpec,
} from "../arc-tasks";

function baseInput(overrides: Partial<NormalizeTaskInput> = {}): NormalizeTaskInput {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    objective: "Draft partner campaign",
    status: "queued",
    priority: "high",
    campaignId: null,
    approvalItemId: null,
    sourceType: null,
    sourceId: null,
    createdAt: "2026-06-09T10:00:00.000Z",
    updatedAt: "2026-06-09T11:00:00.000Z",
    metadata: {},
    agentKey: "arc",
    agentName: "Arc",
    latestLogError: null,
    ...overrides,
  };
}

describe("statusToSpec", () => {
  it("maps native statuses to the spec vocabulary", () => {
    expect(statusToSpec("queued")).toBe("pending");
    expect(statusToSpec("running")).toBe("in_progress");
    expect(statusToSpec("blocked")).toBe("blocked");
    expect(statusToSpec("needs_approval")).toBe("needs_approval");
    expect(statusToSpec("completed")).toBe("completed");
    expect(statusToSpec("failed")).toBe("failed");
    expect(statusToSpec("canceled")).toBe("canceled");
  });
});

describe("resolveStatusFilter", () => {
  it("accepts spec words and maps them to native enum values", () => {
    expect(resolveStatusFilter("pending")).toBe("queued");
    expect(resolveStatusFilter("in_progress")).toBe("running");
  });

  it("accepts native enum values directly", () => {
    expect(resolveStatusFilter("blocked")).toBe("blocked");
    expect(resolveStatusFilter("QUEUED")).toBe("queued");
  });

  it("returns null for unrecognized values", () => {
    expect(resolveStatusFilter("garbage")).toBeNull();
    expect(resolveStatusFilter("")).toBeNull();
  });
});

describe("nextAllowedActions", () => {
  it("offers claim only when queued", () => {
    expect(nextAllowedActions("queued")).toEqual(["claim"]);
  });

  it("offers log/complete/block when running", () => {
    expect(nextAllowedActions("running")).toEqual(["log", "complete", "block"]);
  });

  it("offers log/complete when blocked", () => {
    expect(nextAllowedActions("blocked")).toEqual(["log", "complete"]);
  });

  it("never offers outbound actions and is empty for terminal states", () => {
    for (const terminal of ["completed", "failed", "canceled"]) {
      expect(nextAllowedActions(terminal)).toEqual([]);
    }
    // No state ever yields approve/launch/send/dispatch.
    for (const status of ["queued", "running", "blocked", "needs_approval"]) {
      const actions = nextAllowedActions(status);
      expect(actions).not.toContain("approve");
      expect(actions).not.toContain("launch");
      expect(actions).not.toContain("send");
      expect(actions).not.toContain("dispatch");
    }
  });
});

describe("normalizeAgentTask", () => {
  it("normalizes title/status and always locks outbound", () => {
    const task = normalizeAgentTask(baseInput());
    expect(task.title).toBe("Draft partner campaign");
    expect(task.status).toBe("pending");
    expect(task.raw_status).toBe("queued");
    expect(task.priority).toBe("high");
    expect(task.next_allowed_actions).toEqual(["claim"]);
    expect(task.outbound_locked).toBe(true);
  });

  it("derives assignee 'arc' from the agent key, else the agent name", () => {
    expect(normalizeAgentTask(baseInput({ agentKey: "arc" })).assignee).toBe("arc");
    expect(normalizeAgentTask(baseInput({ agentKey: "other", agentName: "Atlas" })).assignee).toBe("Atlas");
    expect(
      normalizeAgentTask(baseInput({ agentKey: null, agentName: null })).assignee,
    ).toBe("unassigned");
  });

  it("prefers metadata.blocked_reason, then the latest log error, then null", () => {
    expect(
      normalizeAgentTask(baseInput({ metadata: { blocked_reason: "waiting on assets" } })).blocked_reason,
    ).toBe("waiting on assets");
    expect(
      normalizeAgentTask(baseInput({ metadata: {}, latestLogError: "tool timeout" })).blocked_reason,
    ).toBe("tool timeout");
    expect(normalizeAgentTask(baseInput({ metadata: {}, latestLogError: null })).blocked_reason).toBeNull();
  });

  it("resolves related_type by precedence campaign > approval > source > other", () => {
    expect(normalizeAgentTask(baseInput({ campaignId: "c1", approvalItemId: "a1" })).related_type).toBe(
      "campaign",
    );
    expect(normalizeAgentTask(baseInput({ campaignId: "c1", approvalItemId: "a1" })).related_id).toBe("c1");
    expect(normalizeAgentTask(baseInput({ approvalItemId: "a1" })).related_type).toBe("approval");
    expect(
      normalizeAgentTask(baseInput({ sourceType: "lead", sourceId: "l1" })).related_type,
    ).toBe("lead");
    expect(normalizeAgentTask(baseInput()).related_type).toBe("other");
    expect(normalizeAgentTask(baseInput()).related_id).toBeNull();
  });
});

describe("canOperatorMoveTask", () => {
  it("allows ordinary lifecycle drags", () => {
    expect(canOperatorMoveTask("queued", "running", { hasOpenApproval: false })).toEqual({ ok: true });
    expect(canOperatorMoveTask("blocked", "queued", { hasOpenApproval: false })).toEqual({ ok: true });
    expect(canOperatorMoveTask("running", "completed", { hasOpenApproval: false })).toEqual({ ok: true });
  });

  it("never moves a task out of a terminal state", () => {
    for (const from of ["completed", "failed", "canceled"] as const) {
      expect(canOperatorMoveTask(from, "queued", { hasOpenApproval: false })).toEqual({
        ok: false,
        reason: "terminal",
      });
    }
  });

  it("blocks completing a task that still has an open approval", () => {
    expect(canOperatorMoveTask("running", "completed", { hasOpenApproval: true })).toEqual({
      ok: false,
      reason: "open_approval",
    });
  });

  it("forbids dragging straight from needs_approval to completed", () => {
    expect(canOperatorMoveTask("needs_approval", "completed", { hasOpenApproval: false })).toEqual({
      ok: false,
      reason: "approval_gate",
    });
  });

  it("allows releasing a needs_approval task back into the workflow", () => {
    expect(canOperatorMoveTask("needs_approval", "queued", { hasOpenApproval: false })).toEqual({ ok: true });
    expect(canOperatorMoveTask("needs_approval", "canceled", { hasOpenApproval: false })).toEqual({ ok: true });
  });

  it("rejects an unknown / same-column target", () => {
    expect(canOperatorMoveTask("queued", "queued", { hasOpenApproval: false })).toEqual({
      ok: false,
      reason: "no_change",
    });
    expect(canOperatorMoveTask("queued", "banana", { hasOpenApproval: false })).toEqual({
      ok: false,
      reason: "invalid_target",
    });
  });
});
