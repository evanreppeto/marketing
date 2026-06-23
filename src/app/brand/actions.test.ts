import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentOrgId: vi.fn(async () => "org-1"),
  getOperatorActor: vi.fn(() => "operator"),
  insertAsset: vi.fn(async () => "asset-note"),
  isSupabaseAdminConfigured: vi.fn(() => true),
  learnBrandKnowledgeFromAsset: vi.fn(async () => ({ created: 2, skipped: 0, errors: [], updatedProfile: true })),
  requireOperator: vi.fn(async () => undefined),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/auth/org", () => ({
  getCurrentOrgId: mocks.getCurrentOrgId,
}));

vi.mock("@/lib/auth/operator", () => ({
  getOperatorActor: mocks.getOperatorActor,
  requireOperator: mocks.requireOperator,
}));

vi.mock("@/lib/brand-knowledge/brain-sync", () => ({
  learnBrandKnowledgeFromAsset: mocks.learnBrandKnowledgeFromAsset,
}));

vi.mock("@/lib/media-library/persistence", () => ({
  insertAsset: mocks.insertAsset,
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: mocks.isSupabaseAdminConfigured,
}));

import { submitBrandIntakeAction } from "./actions";

function fd(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

describe("submitBrandIntakeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentOrgId.mockResolvedValue("org-1");
    mocks.getOperatorActor.mockReturnValue("operator");
    mocks.insertAsset.mockResolvedValue("asset-note");
    mocks.isSupabaseAdminConfigured.mockReturnValue(true);
    mocks.learnBrandKnowledgeFromAsset.mockResolvedValue({ created: 2, skipped: 0, errors: [], updatedProfile: true });
  });

  it("rejects empty intake submissions", async () => {
    const result = await submitBrandIntakeAction(null, fd({ brandNotes: " ", websiteUrl: " " }));

    expect(result).toEqual({
      ok: false,
      message: "Add brand notes, a website, or at least one file.",
      items: ["Tell Arc what the company does, paste a public website, or attach brand assets"],
    });
    expect(mocks.insertAsset).not.toHaveBeenCalled();
    expect(mocks.learnBrandKnowledgeFromAsset).not.toHaveBeenCalled();
  });

  it("stores freeform brand notes as a Library source and learns from it", async () => {
    const result = await submitBrandIntakeAction(
      null,
      fd({
        brandNotes: "We restore homes after water damage. We sound calm, fast, and specific.",
        websiteUrl: "",
      }),
    );

    expect(mocks.insertAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        folderId: null,
        fileName: expect.stringMatching(/^Brand intake notes - .*\.txt$/),
        contentType: "text/plain",
        kind: "document",
        source: "uploaded",
        provenance: { brandSource: true, intakeKind: "operator_notes" },
        uploadedBy: "operator",
      }),
    );
    expect(mocks.learnBrandKnowledgeFromAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "asset-note",
        fileName: expect.stringMatching(/^Brand intake notes - .*\.txt$/),
        kind: "document",
        source: "uploaded",
        tags: ["brand source", "operator notes"],
        availableToArc: true,
        contentType: "text/plain",
        extractedText: "We restore homes after water damage. We sound calm, fast, and specific.",
      }),
      { orgId: "org-1" },
    );
    expect(result).toEqual({
      ok: true,
      message: "Brand intake processed from 1 source.",
      items: ["Saved operator notes to Library", "Updated brand details from parsed files", "Created 2 Brain notes for review"],
    });
  });
});
