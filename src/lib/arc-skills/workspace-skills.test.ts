import { describe, expect, it, vi } from "vitest";

vi.mock("./github", () => ({ getWorkspaceArcSkills: vi.fn() }));
vi.mock("@/lib/exemplar-skills/persistence", async () => {
  const actual = await vi.importActual<typeof import("@/lib/exemplar-skills/persistence")>(
    "@/lib/exemplar-skills/persistence",
  );
  return { ...actual, listGeneratedSkills: vi.fn() };
});

import { listGeneratedSkills, type GeneratedSkillRecord } from "@/lib/exemplar-skills/persistence";

import { getWorkspaceArcSkills } from "./github";
import { getAllWorkspaceArcSkills } from "./workspace-skills";

const imported = {
  key: "github-acme-brief",
  id: "company-research" as const,
  name: "Campaign brief",
  description: "Build a brief.",
  prompt: "Build a brief.",
  commands: ["/brief-campaign"],
  mode: "ask" as const,
  source: "github" as const,
  publisher: "acme/brief",
  instructions: "# brief",
  repositoryUrl: "https://github.com/acme/brief",
};

const generated: GeneratedSkillRecord = {
  key: "generated-bsr-email",
  name: "BSR email voice",
  description: "Write email copy in BSR's voice.",
  command: "/write-email-all",
  assetType: "email",
  persona: null,
  evidenceTier: "approval",
  instructions: "# examples",
  exemplarCount: 4,
  sourceAssetIds: ["a1"],
  counterExampleAssetIds: [],
  generatedAt: "2026-07-22T12:00:00.000Z",
};

const mocked = {
  imported: vi.mocked(getWorkspaceArcSkills),
  generated: vi.mocked(listGeneratedSkills),
};

function setup(importedSkills: unknown[], generatedSkills: GeneratedSkillRecord[]) {
  mocked.imported.mockResolvedValue(importedSkills as never);
  mocked.generated.mockResolvedValue(generatedSkills);
}

describe("getAllWorkspaceArcSkills", () => {
  it("returns nothing without an org", async () => {
    setup([imported], [generated]);
    expect(await getAllWorkspaceArcSkills(null, "BSR")).toEqual([]);
    expect(mocked.imported).not.toHaveBeenCalled();
    expect(mocked.generated).not.toHaveBeenCalled();
  });

  it("merges imported and generated skills so both commands resolve", async () => {
    setup([imported], [generated]);
    const skills = await getAllWorkspaceArcSkills("org-1", "Big Shoulders Restoration");
    expect(skills.map((skill) => skill.commands[0])).toEqual(["/brief-campaign", "/write-email-all"]);
    const voice = skills.find((skill) => skill.source === "generated")!;
    expect(voice.publisher).toBe("Big Shoulders Restoration");
    expect(voice.instructions).toBe("# examples");
    expect(voice.mode).toBe("draft");
  });

  it("lets an imported skill win a command collision", async () => {
    // The operator chose the import explicitly; a generated command is derived
    // automatically and can be regenerated under a different slice.
    setup([{ ...imported, commands: ["/write-email-all"] }], [generated]);
    const skills = await getAllWorkspaceArcSkills("org-1", "BSR");
    expect(skills).toHaveLength(1);
    expect(skills[0]!.source).toBe("github");
  });

  it("drops a generated skill whose key already exists as an import", async () => {
    setup([{ ...imported, key: generated.key }], [generated]);
    const skills = await getAllWorkspaceArcSkills("org-1", "BSR");
    expect(skills).toHaveLength(1);
    expect(skills[0]!.source).toBe("github");
  });

  it("still returns imported skills when the generated read fails", async () => {
    // A missing table or a transient error must not take the whole Skills
    // surface down with it.
    mocked.imported.mockResolvedValue([imported] as never);
    mocked.generated.mockRejectedValue(new Error("relation does not exist"));
    const skills = await getAllWorkspaceArcSkills("org-1", "BSR");
    expect(skills.map((skill) => skill.key)).toEqual([imported.key]);
  });

  it("still returns generated skills when the imported read fails", async () => {
    mocked.imported.mockRejectedValue(new Error("settings unavailable"));
    mocked.generated.mockResolvedValue([generated]);
    const skills = await getAllWorkspaceArcSkills("org-1", "BSR");
    expect(skills.map((skill) => skill.key)).toEqual([generated.key]);
  });
});
