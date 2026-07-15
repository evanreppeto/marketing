import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({
  requireOperator: vi.fn(async () => undefined),
  getOperatorActor: vi.fn(async () => "Operator"),
}));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: vi.fn(async () => "org-1") }));
vi.mock("@/lib/billing/entitlements", () => ({
  checkUsageAllowed: vi.fn(async () => ({ allowed: true })),
  formatCentsUsd: vi.fn((c: number) => `$${c / 100}`),
}));
vi.mock("@/lib/arc-chat/agent-config", () => ({ getArcDisplayName: vi.fn(async () => "Arc") }));
vi.mock("@/lib/arc-chat/enqueue", () => ({ enqueueArcChatTask: vi.fn(async () => "task-1") }));
vi.mock("@/lib/arc-chat/sharing", () => ({
  assertConversationAccess: vi.fn(async () => ({})),
  getCreationTenancy: vi.fn(async () => ({})),
}));
vi.mock("@/lib/arc-chat/persistence", () => ({
  getArcMessage: vi.fn(),
  getPrecedingOperatorMessage: vi.fn(),
  deleteMessagesAfter: vi.fn(async () => 1),
  updateOperatorMessageBody: vi.fn(async () => true),
  touchConversation: vi.fn(async () => undefined),
}));

import { getArcMessage, getPrecedingOperatorMessage, deleteMessagesAfter, updateOperatorMessageBody } from "@/lib/arc-chat/persistence";
import { enqueueArcChatTask } from "@/lib/arc-chat/enqueue";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { regenerateArcReplyAction, editAndResendArcMessageAction } from "./actions";

const getMsg = vi.mocked(getArcMessage);
const getPrev = vi.mocked(getPrecedingOperatorMessage);
const del = vi.mocked(deleteMessagesAfter);
const updateBody = vi.mocked(updateOperatorMessageBody);
const enqueue = vi.mocked(enqueueArcChatTask);
const configured = vi.mocked(isSupabaseAdminConfigured);

function operatorMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "op-1", conversationId: "conv-1", role: "operator", body: "Find leads",
    mentions: [], attachments: [], mode: "ask", route: "fast", command: null,
    skillId: null, contextScopes: [], createdAt: "2026-07-15T10:00:00Z", ...overrides,
  } as unknown as Awaited<ReturnType<typeof getArcMessage>>;
}
function arcReply(overrides: Record<string, unknown> = {}) {
  return { id: "arc-1", conversationId: "conv-1", role: "arc", body: "…", createdAt: "2026-07-15T10:00:05Z", ...overrides } as unknown as Awaited<ReturnType<typeof getArcMessage>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  configured.mockReturnValue(true);
  del.mockResolvedValue(1);
  updateBody.mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("regenerateArcReplyAction", () => {
  it("truncates after the prompting operator turn and re-runs it", async () => {
    getMsg.mockResolvedValueOnce(arcReply());
    getPrev.mockResolvedValueOnce(operatorMessage());

    const result = await regenerateArcReplyAction("arc-1");

    expect(result).toEqual({ ok: true });
    expect(del).toHaveBeenCalledWith("conv-1", "op-1");
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ messageId: "op-1", message: "Find leads", conversationId: "conv-1" }));
  });

  it("rejects a non-arc message", async () => {
    getMsg.mockResolvedValueOnce(operatorMessage());
    const result = await regenerateArcReplyAction("op-1");
    expect(result.ok).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("errors cleanly when no prompting message is found", async () => {
    getMsg.mockResolvedValueOnce(arcReply());
    getPrev.mockResolvedValueOnce(null);
    const result = await regenerateArcReplyAction("arc-1");
    expect(result.ok).toBe(false);
    expect(del).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("needs a backend", async () => {
    configured.mockReturnValue(false);
    const result = await regenerateArcReplyAction("arc-1");
    expect(result.ok).toBe(false);
    expect(getMsg).not.toHaveBeenCalled();
  });
});

describe("editAndResendArcMessageAction", () => {
  it("updates the body, truncates after it, and re-runs with the new text", async () => {
    getMsg.mockResolvedValueOnce(operatorMessage());

    const result = await editAndResendArcMessageAction({ messageId: "op-1", body: "Find storm leads instead" });

    expect(result).toEqual({ ok: true });
    expect(updateBody).toHaveBeenCalledWith("op-1", "Find storm leads instead");
    expect(del).toHaveBeenCalledWith("conv-1", "op-1");
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ messageId: "op-1", message: "Find storm leads instead" }));
  });

  it("rejects an empty body before writing", async () => {
    const result = await editAndResendArcMessageAction({ messageId: "op-1", body: "   " });
    expect(result.ok).toBe(false);
    expect(updateBody).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects editing a non-operator message", async () => {
    getMsg.mockResolvedValueOnce(arcReply());
    const result = await editAndResendArcMessageAction({ messageId: "arc-1", body: "hi" });
    expect(result.ok).toBe(false);
    expect(updateBody).not.toHaveBeenCalled();
  });
});
