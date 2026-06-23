import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/embeddings/gemini-embeddings", () => ({ embedText: vi.fn() }));
import { embedText } from "@/lib/embeddings/gemini-embeddings";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";
import { embedHash } from "@/domain";
import { upsertReferenceNode } from "./persistence";

const embedMock = vi.mocked(embedText);
const ORG = "org-u-1";
const FAKE_VEC = Array.from({ length: 768 }, (_, i) => i / 768);
beforeEach(() => embedMock.mockReset());
afterEach(() => vi.restoreAllMocks());

const NODE = { kind: "crm_company", key: "crm:companies:c1", label: "Acme", summary: "Company: Acme", refTable: "companies" as const, refId: "c1" };

it("skips re-embed when the stored hash matches the new text", async () => {
  const hash = embedHash(["Acme", "Company: Acme"].join("\n").trim());
  const supabase = createSupabaseQueryMock({
    knowledge_nodes: [
      { data: { id: "n-1", props: { embed_hash: hash } }, error: null }, // lookup
      { data: { id: "n-1" }, error: null }, // update (no embed follows)
    ],
  });
  const result = await upsertReferenceNode(NODE, { client: supabase as never, orgId: ORG });
  expect(result).toEqual({ ok: true, id: "n-1" });
  expect(embedMock).not.toHaveBeenCalled();
});

it("re-embeds when the text changed", async () => {
  embedMock.mockResolvedValue(FAKE_VEC);
  const supabase = createSupabaseQueryMock({
    knowledge_nodes: [
      { data: { id: "n-1", props: { embed_hash: "stale" } }, error: null },
      { data: { id: "n-1" }, error: null },
      { data: { id: "n-1" }, error: null },
    ],
  });
  await upsertReferenceNode(NODE, { client: supabase as never, orgId: ORG });
  expect(embedMock).toHaveBeenCalledOnce();
});
