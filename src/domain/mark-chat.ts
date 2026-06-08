/**
 * Pure logic for the Mark chat surface. No I/O. Mentions, message validation,
 * and deterministic thread titles (this app has no LLM — titles are derived,
 * not generated).
 */

export const MENTION_TYPES = [
  "campaign",
  "lead",
  "company",
  "contact",
  "property",
  "job",
  "outcome",
  "persona",
  "vault",
] as const;

export type MentionType = (typeof MENTION_TYPES)[number];

export type MarkMention = {
  type: MentionType;
  id: string;
  label: string;
  href: string;
};

export class MarkMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkMessageError";
  }
}

export const MAX_MARK_MESSAGE = 4000;
const MAX_TITLE = 60;

export function deriveThreadTitle(firstMessage: string): string {
  const collapsed = firstMessage.replace(/\s+/g, " ").trim();
  if (!collapsed) return "New chat";
  if (collapsed.length <= MAX_TITLE) return collapsed;
  const slice = collapsed.slice(0, MAX_TITLE);
  const lastSpace = slice.lastIndexOf(" ");
  const head = lastSpace > 20 ? slice.slice(0, lastSpace) : slice;
  return `${head.trimEnd()}…`;
}

export function isMarkMention(value: unknown): value is MarkMention {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.type === "string" &&
    (MENTION_TYPES as readonly string[]).includes(m.type) &&
    typeof m.id === "string" &&
    m.id.length > 0 &&
    typeof m.label === "string" &&
    typeof m.href === "string"
  );
}

export function parseMentions(value: unknown): MarkMention[] {
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMarkMention);
}

export function serializeMentions(mentions: MarkMention[]): string {
  return JSON.stringify(mentions.filter(isMarkMention));
}

export function validateMarkMessageInput(input: { body: string; mentions: MarkMention[] }): {
  body: string;
  mentions: MarkMention[];
} {
  const body = input.body.replace(/\s+$/g, "").replace(/^\s+/g, "");
  if (!body.trim()) {
    throw new MarkMessageError("Write a message for Mark first.");
  }
  if (body.length > MAX_MARK_MESSAGE) {
    throw new MarkMessageError(`Keep it under ${MAX_MARK_MESSAGE} characters.`);
  }
  return { body, mentions: input.mentions.filter(isMarkMention) };
}
