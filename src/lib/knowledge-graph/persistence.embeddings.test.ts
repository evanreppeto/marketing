import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/embeddings/gemini-embeddings", () => ({ embedText: vi.fn() }));

import { embedText } from "@/lib/embeddings/gemini-embeddings";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { createNode } from "./persistence";

const embedMock = vi.mocked(embedText);
const ORG = "org-embed-1";
const FAKE_VEC = Array.from({ length: 768 }, (_, i) => i / 768);

beforeEach(() => {
  embedMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createNode — best-effort embedding", () => {
  it("calls embedText with joined label/summary/body and updates the node's embedding on success", async () => {
    // First from("knowledge_nodes") → insert returns id; second → update returns id
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: [
        { data: { id: "n-embed-1" }, error: null },
        { data: { id: "n-embed-1" }, error: null },
      ],
    });
    embedMock.mockResolvedValue(FAKE_VEC);

    const result = await createNode(
      { kind: "learning", label: "Flood persona", summary: "Homeowners", body: "Detail here" },
      { client: supabase as never, orgId: ORG, createdBy: "arc" },
    );

    expect(result).toEqual({ ok: true, id: "n-embed-1" });

    // embedText was called with label + summary + body joined
    expect(embedMock).toHaveBeenCalledOnce();
    const textArg = embedMock.mock.calls[0][0];
    expect(textArg).toContain("Flood persona");
    expect(textArg).toContain("Homeowners");
    expect(textArg).toContain("Detail here");

    // An update call was made on knowledge_nodes with the embedding
    const updateCall = supabase.calls.find(([m]) => m === "update") as [string, Record<string, unknown>] | undefined;
    expect(updateCall).toBeDefined();
    expect(typeof updateCall![1].embedding).toBe("string");
    // The embedding JSON should be a valid array representation
    expect(JSON.parse(updateCall![1].embedding as string)).toHaveLength(768);
  });

  it("skips the update and still returns {ok:true} when embedText returns null", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: { data: { id: "n-embed-2" }, error: null },
    });
    embedMock.mockResolvedValue(null);

    const result = await createNode(
      { kind: "learning", label: "No embedding" },
      { client: supabase as never, orgId: ORG, createdBy: "arc" },
    );

    expect(result).toEqual({ ok: true, id: "n-embed-2" });
    // No update call should have been made
    expect(supabase.calls.some(([m]) => m === "update")).toBe(false);
  });

  it("still returns {ok:true} when the embedding update throws (best-effort)", async () => {
    // First call (insert) succeeds; second call (update) throws
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: [
        { data: { id: "n-embed-3" }, error: null },
        { data: null, error: { message: "vector column error" } },
      ],
    });
    embedMock.mockResolvedValue(FAKE_VEC);

    const result = await createNode(
      { kind: "learning", label: "Error test node" },
      { client: supabase as never, orgId: ORG, createdBy: "arc" },
    );

    // Even though the update returned an error, createNode should succeed
    expect(result).toEqual({ ok: true, id: "n-embed-3" });
  });
});
