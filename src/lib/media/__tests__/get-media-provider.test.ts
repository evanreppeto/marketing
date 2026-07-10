import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the model opts handed to the provider factory so we can assert the
// override -> level -> (env/default) precedence getMediaProvider implements.
// vi.hoisted so the mock fn exists before the hoisted vi.mock factory runs.
const { createGeminiMediaProvider } = vi.hoisted(() => ({ createGeminiMediaProvider: vi.fn(() => ({})) }));
vi.mock("../gemini", () => ({
  createGeminiMediaProvider,
  resolveModel: (s?: string, e?: string, f?: string) => (s && s.trim()) || (e && e.trim()) || f,
}));

import { getMediaProvider } from "../index";

const ORIG = {
  ARC_MEDIA_ENABLED: process.env.ARC_MEDIA_ENABLED,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};

beforeEach(() => {
  createGeminiMediaProvider.mockClear();
  process.env.ARC_MEDIA_ENABLED = "1";
  process.env.GEMINI_API_KEY = "k";
});
afterEach(() => {
  for (const [k, v] of Object.entries(ORIG)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function lastOpts(): { imageModel?: string; videoModel?: string } {
  const calls = createGeminiMediaProvider.mock.calls as unknown as Array<[unknown, { imageModel?: string; videoModel?: string }?]>;
  return calls.at(-1)?.[1] ?? {};
}

describe("getMediaProvider precedence", () => {
  it("returns null when no API key is available", () => {
    expect(getMediaProvider(null, { level: "standard" })).toBeNull();
    expect(createGeminiMediaProvider).not.toHaveBeenCalled();
  });

  it("explicit Advanced override beats the level", () => {
    getMediaProvider("k", { level: "standard", imageModel: "gemini-2.5-flash-image" });
    expect(lastOpts().imageModel).toBe("gemini-2.5-flash-image"); // override, not Studio's Pro
  });

  it("level maps to its media tier when there is no override", () => {
    getMediaProvider("k", { level: "standard" });
    expect(lastOpts().imageModel).toBe("gemini-3-pro-image");
    expect(lastOpts().videoModel).toBe("veo-3.1-generate-preview");
    getMediaProvider("k", { level: "fast" });
    expect(lastOpts().imageModel).toBe("gemini-3.1-flash-image");
    expect(lastOpts().videoModel).toBe("veo-3.1-fast-generate-preview");
  });

  it("passes undefined (provider falls back to env/default) with neither override nor level", () => {
    getMediaProvider("k", {});
    expect(lastOpts().imageModel).toBeUndefined();
    expect(lastOpts().videoModel).toBeUndefined();
  });
});
