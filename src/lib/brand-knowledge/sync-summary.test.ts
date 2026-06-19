import { describe, expect, it } from "vitest";

import { summarizeBrandKnowledgeSync } from "./sync-summary";

describe("summarizeBrandKnowledgeSync", () => {
  it("turns parsed source results into a plain-language update summary", () => {
    const summary = summarizeBrandKnowledgeSync({
      sources: 3,
      created: 5,
      skipped: 2,
      updatedProfiles: 1,
      errors: [],
    });

    expect(summary.ok).toBe(true);
    expect(summary.message).toBe("Brand updated from 3 files.");
    expect(summary.items).toEqual([
      "Updated brand details from parsed files",
      "Created 5 Brain notes for review",
      "Skipped 2 notes already in Brain",
    ]);
  });
});
