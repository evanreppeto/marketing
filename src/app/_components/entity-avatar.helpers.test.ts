import { describe, expect, it } from "vitest";

import { initialsFromName, resolveHumanAvatar } from "./entity-avatar.helpers";

describe("initialsFromName", () => {
  it("returns first+last initials for multi-word names", () => {
    expect(initialsFromName("Evan Reppeto")).toBe("ER");
  });
  it("returns first two letters for a single word", () => {
    expect(initialsFromName("Arc")).toBe("AR");
  });
  it("falls back to ? for empty input", () => {
    expect(initialsFromName("   ")).toBe("?");
  });
});

describe("resolveHumanAvatar", () => {
  it("uses the photo when a non-empty url is present", () => {
    expect(resolveHumanAvatar({ name: "Evan Reppeto", profilePictureUrl: "https://x/p.png" }))
      .toEqual({ kind: "photo", url: "https://x/p.png" });
  });
  it("falls back to initials when url is missing or blank", () => {
    expect(resolveHumanAvatar({ name: "Evan Reppeto", profilePictureUrl: "  " }))
      .toEqual({ kind: "initials", initials: "ER" });
    expect(resolveHumanAvatar({ name: "Evan Reppeto" }))
      .toEqual({ kind: "initials", initials: "ER" });
  });
});
