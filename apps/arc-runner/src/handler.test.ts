import { describe, expect, it, vi } from "vitest";

import type { ArcClient } from "./arc-client";
import type { Config } from "./config";
import { runArcCampaignTask } from "./arc";
import { handleCampaignTask } from "./handler";

vi.mock("./arc", () => ({
  runArcCampaignTask: vi.fn(async () => ({
    body: "I drafted the first campaign assets.",
    actions: [{ kind: "draft", title: "Email", rows: [], flags: [] }],
    suggestions: ["Review the drafts"],
    sources: [],
    questions: [],
    memory: [],
  })),
}));

function client() {
  return {
    postChatReply: vi.fn(async () => {}),
    apiPost: vi.fn(async () => ({})),
  } as unknown as ArcClient & {
    postChatReply: ReturnType<typeof vi.fn>;
    apiPost: ReturnType<typeof vi.fn>;
  };
}

describe("handleCampaignTask", () => {
  it("runs a campaign task in Arc and posts the reply to the linked conversation", async () => {
    const fakeClient = client();

    await handleCampaignTask(fakeClient, {} as Config, {
      type: "arc_campaign_task",
      agentTaskId: "task-1",
      campaignId: "campaign-1",
      conversationId: "conversation-1",
      message: "Build this campaign.",
      operator: "Operator",
      taskType: "campaign_brief_draft",
    });

    expect(runArcCampaignTask).toHaveBeenCalledWith(
      expect.objectContaining({
        agentTaskId: "task-1",
        campaignId: "campaign-1",
        conversationId: "conversation-1",
        taskType: "campaign_brief_draft",
      }),
      fakeClient,
    );
    expect(fakeClient.postChatReply).toHaveBeenCalledWith(
      expect.objectContaining({
        agentTaskId: "task-1",
        body: "I drafted the first campaign assets.",
        status: "complete",
        metadata: expect.objectContaining({
          actions: [expect.objectContaining({ title: "Email" })],
          suggestions: ["Review the drafts"],
        }),
      }),
    );
    expect(fakeClient.apiPost).not.toHaveBeenCalledWith(expect.stringContaining("/complete"), expect.anything());
  });

  it("completes a campaign task through the Operations API when no chat conversation is linked", async () => {
    const fakeClient = client();

    await handleCampaignTask(fakeClient, {} as Config, {
      type: "arc_campaign_task",
      agentTaskId: "task-2",
      campaignId: "campaign-1",
      conversationId: null,
      message: "Keep building this campaign.",
      operator: "Operator",
      taskType: "campaign_directive",
    });

    expect(fakeClient.postChatReply).not.toHaveBeenCalled();
    expect(fakeClient.apiPost).toHaveBeenCalledWith(
      "/api/v1/arc/tasks/task-2/complete",
      expect.objectContaining({
        summary: "I drafted the first campaign assets.",
        outputs: expect.objectContaining({
          actions: [expect.objectContaining({ title: "Email" })],
        }),
      }),
    );
  });

  it("surfaces recalled memory as metadata.recall when memory items are present", async () => {
    const fakeClient = client();

    vi.mocked(runArcCampaignTask).mockResolvedValueOnce({
      body: "I drafted campaign assets using recalled memory.",
      actions: [],
      suggestions: [],
      sources: [],
      questions: [],
      memory: [{ label: "Landlord playbook", summary: null, kind: "note", confidence: 0.8, nodeId: "n1" }],
      usage: { model: "claude-sonnet-4-5", inputTokens: null, outputTokens: null },
    });

    await handleCampaignTask(fakeClient, {} as Config, {
      type: "arc_campaign_task",
      agentTaskId: "task-3",
      campaignId: "campaign-2",
      conversationId: "conversation-2",
      message: "Build this campaign.",
      operator: "Operator",
      taskType: "campaign_brief_draft",
    });

    expect(fakeClient.postChatReply).toHaveBeenCalledWith(
      expect.objectContaining({
        agentTaskId: "task-3",
        metadata: expect.objectContaining({
          recall: [expect.objectContaining({ label: "Landlord playbook", confidence: 0.8 })],
        }),
      }),
    );
  });
});
