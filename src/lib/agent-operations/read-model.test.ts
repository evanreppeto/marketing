import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getAgentOperationsDashboard } from "./read-model";

describe("getAgentOperationsDashboard", () => {
  it("maps Supabase agent operations into UI-ready dashboard data", async () => {
    const supabase = createSupabaseQueryMock({
      agents: {
        data: [
          {
            id: "agent-1",
            key: "hermes-demo",
            name: "Hermes Demo Orchestrator",
            description: "Coordinates demo lead and campaign work.",
            status: "running",
            allowed_actions: ["Draft"],
            blocked_actions: ["Send"],
            default_approval_policy: "Human approval required",
            metadata: { risk_flags: ["approval required"] },
            updated_at: "2026-05-29T18:00:00.000Z",
          },
        ],
        error: null,
      },
      agent_tasks: {
        data: [
          {
            id: "task-123456789",
            agent_id: "agent-1",
            status: "running",
            priority: "high",
            objective: "Prepare plumbing partner outreach draft.",
            task_type: "campaign_draft",
            source_type: "campaign",
            source_id: "campaign-1",
            campaign_id: "campaign-1",
            approval_item_id: "approval-1",
            due_at: "2026-06-15T18:00:00.000Z",
            completed_at: null,
            created_at: "2026-05-29T18:01:00.000Z",
            updated_at: "2026-05-29T18:02:00.000Z",
            metadata: { risk_level: "medium", progress: { done: 12, total: 20 } },
          },
        ],
        error: null,
      },
      approval_items: {
        data: [
          {
            id: "approval-1",
            campaign_id: "campaign-1",
            campaign_asset_id: "asset-1",
            item_type: "email",
            status: "revision_requested",
            risk_level: "medium",
            requested_by: "hermes-demo",
            submitted_at: "2026-05-29T18:03:00.000Z",
            reviewed_at: null,
            draft_output: { subject: "Partner handoff" },
            decision_notes: null,
          },
        ],
        error: null,
      },
      agent_outputs: {
        data: [
          {
            id: "output-1",
            task_id: "task-123456789",
            approval_item_id: "approval-1",
            title: "Plumbing partner email",
            output_type: "email",
            risk_level: "medium",
            compliance_status: "passed",
            approval_status: "revision_requested",
            created_at: "2026-05-29T18:04:00.000Z",
          },
        ],
        error: null,
      },
      campaigns: {
        data: [
          {
            id: "campaign-1",
            name: "Plumbing Partner Outreach Demo",
            persona: "Plumbing Partner",
            status: "draft",
            objective: "Grow partner referrals.",
          },
        ],
        error: null,
      },
    });

    const dashboard = await getAgentOperationsDashboard(supabase);

    expect(dashboard.status).toBe("live");
    if (dashboard.status !== "live") return;

    expect(dashboard.metrics).toContainEqual({ label: "Awaiting approval", value: 1, delta: "Human gate" });
    expect(dashboard.agents[0]).toMatchObject({
      key: "hermes-demo",
      name: "Hermes Demo Orchestrator",
      status: "Running",
      currentTask: "Prepare plumbing partner outreach draft.",
      riskFlags: ["approval required"],
    });
    expect(dashboard.tasks[0]).toMatchObject({
      id: "task-123",
      agentName: "Hermes Demo Orchestrator",
      task: "Campaign Draft",
      linkedObject: "Campaign: Plumbing Partner Outreach Demo",
      href: "/agent-operations/tasks/task-123456789",
      approvalHref: "/approvals?item=approval-1",
      priority: "High",
      dueAt: "2026-06-15T18:00:00.000Z",
      progress: { done: 12, total: 20 },
    });
    expect(dashboard.approvals[0]).toMatchObject({
      source: "Email",
      campaign: "Plumbing Partner Outreach Demo",
      status: "Revision Requested",
      risk: "Medium",
    });
    expect(dashboard.recentOutputs[0]).toMatchObject({
      output: "Plumbing partner email",
      agent: "Hermes Demo Orchestrator",
      status: "Revision Requested",
    });
    expect(supabase.calls).toContainEqual(["from", "agents"]);
    expect(supabase.calls).toContainEqual(["from", "agent_tasks"]);
    expect(supabase.calls).toContainEqual(["from", "approval_items"]);
  });

  it("returns unavailable when a Supabase lookup fails", async () => {
    const supabase = createSupabaseQueryMock({
      agents: { data: null, error: { message: "permission denied" } },
    });

    await expect(getAgentOperationsDashboard(supabase)).resolves.toMatchObject({
      status: "unavailable",
      message: "agents lookup failed: permission denied",
    });
  });
});
