import { describe, expect, it } from "vitest";

import type { ArcActionCard } from "@/domain";
import type { ArcMessage } from "./persistence";

import {
  collectArcWorkspaceCards,
  selectArcWorkspaceMessages,
} from "./workspace-scope";

function message(
  id: string,
  role: ArcMessage["role"],
  actions: ArcActionCard[] = [],
): ArcMessage {
  return {
    id,
    conversationId: "conversation-1",
    role,
    body: "",
    mode: "act",
    status: "complete",
    agentTaskId: null,
    reasoning: null,
    mentions: [],
    media: [],
    recall: [],
    steps: [],
    toolCalls: [],
    feedback: null,
    suggestions: [],
    actions,
    attachments: [],
    questions: [],
    contextScopes: [],
    route: "standard",
    command: null,
    runDurationMs: null,
    createdAt: "2026-07-23T12:00:00.000Z",
  };
}

const firstDraft: ArcActionCard = {
  kind: "draft",
  title: "Storm email",
  channel: "Email",
  rows: [],
  flags: [],
  approval: { kind: "campaign", campaignId: "campaign-1", assetId: "asset-1" },
};
const revisedDraft: ArcActionCard = {
  ...firstDraft,
  title: "Storm email revision",
  status: "revision",
};
const smsDraft: ArcActionCard = {
  kind: "draft",
  title: "Storm text",
  channel: "SMS",
  rows: [],
  flags: [],
};

const messages = [
  message("operator-1", "operator"),
  message("arc-1", "arc", [firstDraft]),
  message("operator-2", "operator"),
  message("arc-2", "arc", [revisedDraft, smsDraft]),
];

describe("Arc workspace scope", () => {
  it("selects the latest Arc run without operator messages", () => {
    expect(selectArcWorkspaceMessages(messages, "latest").map((item) => item.id)).toEqual(["arc-2"]);
  });

  it("selects the full Arc run history for conversation scope", () => {
    expect(selectArcWorkspaceMessages(messages, "conversation").map((item) => item.id)).toEqual(["arc-1", "arc-2"]);
  });

  it("deduplicates approval assets and keeps the newest representation", () => {
    expect(collectArcWorkspaceCards(messages, "conversation")).toEqual([revisedDraft, smsDraft]);
  });
});
