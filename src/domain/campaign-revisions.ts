/**
 * Pure validation for operator-authored revision instructions sent to Arc from
 * the Campaigns workspace. No I/O — the persistence layer and server action
 * import this to guard input before any write.
 */

export const MIN_REVISION_INSTRUCTION_LENGTH = 3;
export const MAX_REVISION_INSTRUCTION_LENGTH = 2000;

export class RevisionInstructionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevisionInstructionError";
  }
}

/**
 * Trim and validate a revision instruction. Returns the normalized string or
 * throws `RevisionInstructionError` with an operator-facing message.
 */
export function validateRevisionInstruction(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new RevisionInstructionError("Tell Arc what to change.");
  }

  const value = raw.trim();

  if (value.length < MIN_REVISION_INSTRUCTION_LENGTH) {
    throw new RevisionInstructionError("Tell Arc what to change — a few words at least.");
  }

  if (value.length > MAX_REVISION_INSTRUCTION_LENGTH) {
    throw new RevisionInstructionError(
      `Keep the instruction under ${MAX_REVISION_INSTRUCTION_LENGTH} characters.`,
    );
  }

  return value;
}
