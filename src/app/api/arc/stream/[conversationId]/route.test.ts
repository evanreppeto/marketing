import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/operator", () => ({
  requireOperator: vi.fn(async () => undefined),
}));
vi.mock("@/lib/arc-chat/sharing", () => ({
  assertConversationAccess: vi.fn(async () => ({})),
}));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/arc-chat/persistence", () => ({
  getPendingArcMessage: vi.fn(),
}));

import { getPendingArcMessage } from "@/lib/arc-chat/persistence";
import { assertConversationAccess } from "@/lib/arc-chat/sharing";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { GET } from "./route";

const pendingMock = vi.mocked(getPendingArcMessage);
const accessMock = vi.mocked(assertConversationAccess);
const configuredMock = vi.mocked(isSupabaseAdminConfigured);

function pendingMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    role: "arc",
    body: "142 homes took the heaviest hail",
    status: "pending",
    reasoning: "Weighing hail exposure vs. roof age",
    steps: [{ label: "Searching CRM", status: "done", at: "" }],
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof getPendingArcMessage>>;
}

async function readAll(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  configuredMock.mockReturnValue(true);
  accessMock.mockResolvedValue({} as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/arc/stream/:conversationId", () => {
  it("pushes the pending reply then ends with a done event when it completes", async () => {
    // Pending on the first poll, gone (completed) on the second.
    pendingMock.mockResolvedValueOnce(pendingMessage()).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/arc/stream/conv-1"), {
      params: Promise.resolve({ conversationId: "conv-1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const body = await readAll(res);
    expect(body).toContain(": connected");
    expect(body).toContain('"messageId":"msg-1"');
    expect(body).toContain("142 homes took the heaviest hail");
    expect(body).toContain("Weighing hail exposure vs. roof age");
    expect(body).toContain("event: done");
  });

  it("returns 503 when Supabase admin isn't configured", async () => {
    configuredMock.mockReturnValue(false);

    const res = await GET(new Request("http://localhost/api/arc/stream/conv-1"), {
      params: Promise.resolve({ conversationId: "conv-1" }),
    });

    expect(res.status).toBe(503);
    expect(pendingMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the operator can't access the conversation", async () => {
    accessMock.mockRejectedValueOnce(new Error("no access"));

    const res = await GET(new Request("http://localhost/api/arc/stream/conv-1"), {
      params: Promise.resolve({ conversationId: "conv-1" }),
    });

    expect(res.status).toBe(403);
    expect(pendingMock).not.toHaveBeenCalled();
  });
});
