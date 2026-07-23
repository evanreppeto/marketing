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

function cleanTitle(value: string) {
  return value
    .replace(/[`*_#]/g, "")
    .replace(/^(?:highest[- ]leverage|top|best|recommended)\s+(?:opportunity|recommendation)(?:\s+this\s+\w+)?\s*:\s*/i, "")
    .replace(/^(?:stand up|build|create|draft|prepare)\s+(?:a|an|the)\s+/i, "")
    .replace(/^(?:result|answer|summary|recommendation)\s*:\s*/i, "")
    .replace(/[.!?,:;\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulHeading(response: string) {
  const headings = response.matchAll(/^#{1,3}\s+(.+)$/gm);
  for (const match of headings) {
    const heading = cleanTitle(match[1] ?? "");
    if (heading.length >= 8 && !/^(?:summary|result|answer|next steps?|evidence)$/i.test(heading)) return heading;
  }
  return null;
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

/** Upgrade a raw first-prompt title after Arc has completed the first result.
 * Prefers a meaningful response heading, then recognizable task/entity patterns.
 * This stays deterministic: title generation never adds another model call to
 * the critical reply path. */
export function deriveArcOutcomeConversationTitle(input: {
  request: string;
  response: string;
}) {
  const explicitAssetTitle = input.request.match(/\btitle\s+(?:it|this)\s+["“]([^"”]+)["”]/i)?.[1];
  if (explicitAssetTitle) return clipAtWord(cleanTitle(explicitAssetTitle), TITLE_MAX_LENGTH);

  const heading = meaningfulHeading(input.response);
  if (heading) {
    const sentenceCase = `${heading.charAt(0).toLocaleUpperCase()}${heading.slice(1)}`;
    return clipAtWord(sentenceCase, TITLE_MAX_LENGTH);
  }

  if (/\b(?:exact|total)\s+(?:number|count)\s+of\s+leads\b|\bcrm\s+lead\s+(?:total|count)\b/i.test(input.request)) {
    return "CRM lead count";
  }

  if (/\bverification\b/i.test(input.request) && /(?:\barc\b|\brespond)/i.test(input.request)) {
    return "Arc response verification";
  }

  const campaign = input.request.match(/\bcampaign\s+["“]([^"”]+)["”]/i)?.[1];
  if (campaign) {
    const kind = /\bemail\b/i.test(input.request) ? "Email" : /\blanding page\b/i.test(input.request) ? "Landing page" : /\bsms\b/i.test(input.request) ? "SMS" : "Work";
    return clipAtWord(`${kind} for ${cleanTitle(campaign)}`, TITLE_MAX_LENGTH);
  }

  return deriveArcConversationTitle(input.request);
}

/** Manual renames must always win. Only titles that still match the automatic
 * first-request title are eligible for the post-result semantic upgrade. */
export function canRefreshArcConversationTitle(currentTitle: string, firstRequest: string) {
  const normalized = currentTitle.trim();
  return normalized === "New conversation"
    || normalized === "Untitled chat"
    || normalized === deriveArcConversationTitle(firstRequest);
}
