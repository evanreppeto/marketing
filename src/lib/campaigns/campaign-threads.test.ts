import { describe, expect, it } from "vitest";
import { toCampaignTask, type AgentTaskRow } from "./campaign-threads";

const baseRow: AgentTaskRow = {
  id: "11111111-2222-3333-4444-555555555555",
  status: "running",
  priority: "high",
  objective: "Revise Variant B ad copy",
  task_type: "campaign_directive",
  scheduled_for: null,
  due_at: null,
  metadata: { requested_from: "campaign_overview" },
  updated_at: "2026-06-11T12:00:00.000Z",
};

describe("toCampaignTask", () => {
  it("maps a row to a board-style task with a short id and agent driver", () => {
    const t = toCampaignTask(baseRow);
    expect(t.id).toBe("11111111");
    expect(t.objective).toBe("Revise Variant B ad copy");
    expect(t.status).toBe("running");
    expect(t.priority).toBe("High");
    expect(t.driver).toBe("agent");
  });
  it("treats needs_approval as the operator's column (driver = operator)", () => {
    expect(toCampaignTask({ ...baseRow, status: "needs_approval" }).driver).toBe("operator");
  });
});
