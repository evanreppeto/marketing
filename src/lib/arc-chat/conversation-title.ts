const TITLE_MAX_LENGTH = 48;

const REQUEST_PREFIXES = [
  /^(?:please\s+)?(?:can|could|would|will)\s+you\s+/i,
  /^(?:please\s+)?help\s+me\s+(?:to\s+)?/i,
  /^(?:please\s+)?(?:i\s+need|i\s+want)\s+(?:you\s+)?to\s+/i,
  /^(?:please\s+)?(?:let(?:'|’)s|lets)\s+/i,
  /^please\s+/i,
];

function clipAtWord(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const candidate = value.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const clipped = lastSpace >= Math.floor(maxLength * 0.6)
    ? candidate.slice(0, lastSpace)
    : value.slice(0, maxLength);
  return `${clipped.trimEnd()}…`;
}

/** Turn the first operator request into a compact, stable navigation label. */
export function deriveArcConversationTitle(input: string) {
  const firstLine = input
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";

  const command = firstLine.match(/^\/([a-z0-9-]+)/i)?.[1] ?? null;
  let title = firstLine.replace(/^\/[a-z0-9-]+\s*/i, "");
  for (const prefix of REQUEST_PREFIXES) title = title.replace(prefix, "");

  title = title
    .split(/(?<=[.!?])\s+/)[0]!
    .replace(/[.!?,:;\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title && command) title = command.replace(/-/g, " ");
  if (!title) return "New conversation";

  const sentenceCase = `${title.charAt(0).toLocaleUpperCase()}${title.slice(1)}`;
  return clipAtWord(sentenceCase, TITLE_MAX_LENGTH);
}
