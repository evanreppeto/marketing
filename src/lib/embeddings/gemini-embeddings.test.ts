import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { embedContent } = vi.hoisted(() => ({ embedContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function () {
    return { models: { embedContent } };
  }),
}));
import { embedText, EMBEDDING_DIMS } from "./gemini-embeddings";

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
