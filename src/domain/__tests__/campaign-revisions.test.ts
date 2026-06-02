import { describe, expect, it } from "vitest";

import {
  MAX_REVISION_INSTRUCTION_LENGTH,
  RevisionInstructionError,
  validateRevisionInstruction,
} from "../campaign-revisions";

describe("validateRevisionInstruction", () => {
  it("trims and returns a valid instruction", () => {
    expect(validateRevisionInstruction("  make the email shorter  ")).toBe("make the email shorter");
  });

  it("rejects empty or whitespace-only input", () => {
    expect(() => validateRevisionInstruction("   ")).toThrow(RevisionInstructionError);
    expect(() => validateRevisionInstruction("")).toThrow(RevisionInstructionError);
  });

  it("rejects too-short input", () => {
    expect(() => validateRevisionInstruction("hi")).toThrow(RevisionInstructionError);
  });

  it("rejects non-string input", () => {
    expect(() => validateRevisionInstruction(null)).toThrow(RevisionInstructionError);
    expect(() => validateRevisionInstruction(42)).toThrow(RevisionInstructionError);
  });

  it("rejects input over the max length", () => {
    const tooLong = "a".repeat(MAX_REVISION_INSTRUCTION_LENGTH + 1);
    expect(() => validateRevisionInstruction(tooLong)).toThrow(RevisionInstructionError);
  });

  it("accepts input at exactly the max length", () => {
    const atMax = "a".repeat(MAX_REVISION_INSTRUCTION_LENGTH);
    expect(validateRevisionInstruction(atMax)).toHaveLength(MAX_REVISION_INSTRUCTION_LENGTH);
  });
});
