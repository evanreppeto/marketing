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
  it("returns null when media gen is disabled", () => {
    process.env.ARC_MEDIA_ENABLED = "0";
    expect(getMediaProvider({ level: "standard" })).toBeNull();
    expect(createGeminiMediaProvider).not.toHaveBeenCalled();
  });

  it("explicit Advanced override beats the level", () => {
    getMediaProvider({ level: "standard", imageModel: "imagen-4.0-generate-001" });
    expect(lastOpts().imageModel).toBe("imagen-4.0-generate-001"); // override, not Studio's Ultra
  });

  it("level maps to its media tier when there is no override", () => {
    getMediaProvider({ level: "standard" });
    expect(lastOpts().imageModel).toBe("imagen-4.0-ultra-generate-001");
    expect(lastOpts().videoModel).toBe("veo-3.0-generate-001");
    getMediaProvider({ level: "fast" });
    expect(lastOpts().imageModel).toBe("imagen-4.0-generate-001");
    expect(lastOpts().videoModel).toBe("veo-2.0-generate-001");
  });

  it("passes undefined (provider falls back to env/default) with neither override nor level", () => {
    getMediaProvider({});
    expect(lastOpts().imageModel).toBeUndefined();
    expect(lastOpts().videoModel).toBeUndefined();
  });
});
