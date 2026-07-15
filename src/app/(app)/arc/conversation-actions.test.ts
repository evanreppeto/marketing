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
vi.mock("@/lib/arc-chat/sharing", () => ({
  assertConversationAccess: vi.fn(async () => ({})),
  getCreationTenancy: vi.fn(async () => ({})),
}));
vi.mock("@/lib/arc-chat/persistence", () => ({
  renameConversation: vi.fn(async () => undefined),
  setConversationPinned: vi.fn(async () => undefined),
  archiveConversation: vi.fn(async () => undefined),
  deleteConversation: vi.fn(async () => undefined),
}));

import { renameConversation, setConversationPinned, archiveConversation, deleteConversation } from "@/lib/arc-chat/persistence";
import { assertConversationAccess } from "@/lib/arc-chat/sharing";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import {
  renameArcConversationAction,
  pinArcConversationAction,
  archiveArcConversationAction,
  deleteArcConversationAction,
} from "./actions";

const renameMock = vi.mocked(renameConversation);
const pinMock = vi.mocked(setConversationPinned);
const archiveMock = vi.mocked(archiveConversation);
const deleteMock = vi.mocked(deleteConversation);
const accessMock = vi.mocked(assertConversationAccess);
const configured = vi.mocked(isSupabaseAdminConfigured);

beforeEach(() => {
  vi.clearAllMocks();
  configured.mockReturnValue(true);
  accessMock.mockResolvedValue({} as never);
});
afterEach(() => vi.clearAllMocks());

describe("conversation management actions", () => {
  it("renames after checking access", async () => {
    const result = await renameArcConversationAction({ conversationId: "c1", title: "  Storm push  " });
    expect(result).toEqual({ ok: true });
    expect(accessMock).toHaveBeenCalledWith("c1", "collaborate");
    expect(renameMock).toHaveBeenCalledWith("c1", "Storm push");
  });

  it("rejects an empty title before writing", async () => {
    const result = await renameArcConversationAction({ conversationId: "c1", title: "   " });
    expect(result.ok).toBe(false);
    expect(renameMock).not.toHaveBeenCalled();
  });

  it("pins and unpins", async () => {
    await pinArcConversationAction({ conversationId: "c1", pinned: true });
    expect(pinMock).toHaveBeenCalledWith("c1", true);
    await pinArcConversationAction({ conversationId: "c1", pinned: false });
    expect(pinMock).toHaveBeenCalledWith("c1", false);
  });

  it("archives", async () => {
    const result = await archiveArcConversationAction("c1");
    expect(result).toEqual({ ok: true });
    expect(archiveMock).toHaveBeenCalledWith("c1");
  });

  it("deletes", async () => {
    const result = await deleteArcConversationAction("c1");
    expect(result).toEqual({ ok: true });
    expect(deleteMock).toHaveBeenCalledWith("c1");
  });

  it("blocks deletion without a backend", async () => {
    configured.mockReturnValue(false);
    const result = await deleteArcConversationAction("c1");
    expect(result.ok).toBe(false);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("surfaces an access denial as a failed result", async () => {
    accessMock.mockRejectedValueOnce(new Error("no access"));
    const result = await deleteArcConversationAction("c1");
    expect(result.ok).toBe(false);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
