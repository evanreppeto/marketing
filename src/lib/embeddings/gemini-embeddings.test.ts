import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { embedContent } = vi.hoisted(() => ({ embedContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function () {
    return { models: { embedContent } };
  }),
}));
import { embedText, probeEmbedding, EMBEDDING_DIMS } from "./gemini-embeddings";

const KEY = process.env.GEMINI_API_KEY;
beforeEach(() => { embedContent.mockReset(); process.env.GEMINI_API_KEY = "k"; });
afterEach(() => { if (KEY === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = KEY; });

const vec = (n: number) => Array.from({ length: n }, (_, i) => i / n);

describe("embedText", () => {
  it("returns the embedding vector on success", async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: vec(EMBEDDING_DIMS) }] });
    const out = await embedText("homeowners like fast response");
    expect(out).toHaveLength(EMBEDDING_DIMS);
  });
  it("returns null when the key is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await embedText("x")).toBeNull();
    expect(embedContent).not.toHaveBeenCalled();
  });
  it("returns null on empty text", async () => {
    expect(await embedText("   ")).toBeNull();
    expect(embedContent).not.toHaveBeenCalled();
  });
  it("returns null when the API throws", async () => {
    embedContent.mockRejectedValue(new Error("boom"));
    expect(await embedText("x")).toBeNull();
  });
  it("returns null on a wrong-sized vector", async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: vec(10) }] });
    expect(await embedText("x")).toBeNull();
  });
});

describe("probeEmbedding", () => {
  it("reports ok with the dimension on success", async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: vec(EMBEDDING_DIMS) }] });
    expect(await probeEmbedding()).toEqual({ ok: true, model: expect.any(String), dims: EMBEDDING_DIMS });
  });
  it("surfaces the real error (status + message) instead of collapsing to null", async () => {
    embedContent.mockRejectedValue(Object.assign(new Error("permission denied"), { status: 403 }));
    const r = await probeEmbedding();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("status 403");
    if (!r.ok) expect(r.error).toContain("permission denied");
  });
  it("flags a wrong dimensionality distinctly from a failure", async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: vec(3072) }] });
    const r = await probeEmbedding();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("3072");
  });
  it("reports the missing key without calling the API", async () => {
    delete process.env.GEMINI_API_KEY;
    const r = await probeEmbedding();
    expect(r.ok).toBe(false);
    expect(embedContent).not.toHaveBeenCalled();
  });
});
