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

export type MarkMediaKind = "image" | "video";

/** Where a piece of creative came from (CLAUDE.md: Asset Review and Provenance). */
export type MarkMediaSource = "bsr_real" | "ai_generated" | "composite" | "stock" | "external";
/** Review/approval state of an asset or media item. */
export type MarkAssetStatus = "draft" | "revision" | "approved" | "rejected";

const MEDIA_SOURCES: readonly MarkMediaSource[] = ["bsr_real", "ai_generated", "composite", "stock", "external"];
const ASSET_STATUSES: readonly MarkAssetStatus[] = ["draft", "revision", "approved", "rejected"];

/** A piece of media Mark generated, attached to a reply via metadata.media. */
export type MarkMedia = {
  kind: MarkMediaKind;
  url: string;
  thumbnailUrl?: string;
  poster?: string; // video poster frame
  caption?: string;
  alt?: string;
  href?: string; // optional link (e.g. open in gallery / approval)
  // Provenance + review metadata — what it is, where it came from, whether it's safe.
  source?: MarkMediaSource;
  sourceId?: string; // approved-media source id when reusing real BSR media
  jobId?: string; // generation job id (AI)
  model?: string; // generation model (AI)
  format?: string; // aspect/format label: "1:1" | "4:5" | "9:16" | "16:9" | "pdf" | "mp4" | …
  status?: MarkAssetStatus;
  riskFlags?: string[]; // e.g. "embedded text", "claim risk", "privacy/redaction"
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

const STRING_FIELDS = ["thumbnailUrl", "poster", "caption", "alt", "href", "sourceId", "jobId", "model", "format"] as const;

function parseRiskFlags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const flags = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return flags.length > 0 ? flags : undefined;
}

/** Parse Mark's attached media from a reply's metadata.media (array or JSON). */
export function parseMedia(value: unknown): MarkMedia[] {
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const out: MarkMedia[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const kind: MarkMediaKind | null = m.kind === "video" ? "video" : m.kind === "image" ? "image" : null;
    const url = typeof m.url === "string" ? m.url.trim() : "";
    if (!kind || !url) continue;

    const media: MarkMedia = { kind, url };
    for (const field of STRING_FIELDS) {
      const v = m[field];
      if (typeof v === "string" && v.trim()) media[field] = v;
    }
    if (typeof m.source === "string" && (MEDIA_SOURCES as readonly string[]).includes(m.source)) {
      media.source = m.source as MarkMediaSource;
    }
    if (typeof m.status === "string" && (ASSET_STATUSES as readonly string[]).includes(m.status)) {
      media.status = m.status as MarkAssetStatus;
    }
    const flags = parseRiskFlags(m.riskFlags);
    if (flags) media.riskFlags = flags;
    out.push(media);
  }
  return out;
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

export type MarkMode = "ask" | "act" | "draft";
export type MarkRoute = "fast" | "standard";

const MARK_MODES: readonly MarkMode[] = ["ask", "act", "draft"];
const MARK_ROUTES: readonly MarkRoute[] = ["fast", "standard"];

/** Parse the composer's stance; anything unrecognized falls back to read-only "ask". */
export function parseMarkMode(value: unknown): MarkMode {
  return typeof value === "string" && (MARK_MODES as readonly string[]).includes(value)
    ? (value as MarkMode)
    : "ask";
}

/** Parse the model routing hint; anything unrecognized stays on the cheap/fast lane. */
export function parseMarkRoute(value: unknown): MarkRoute {
  return typeof value === "string" && (MARK_ROUTES as readonly string[]).includes(value)
    ? (value as MarkRoute)
    : "fast";
}

export type MarkActionFlag = { tone: "ok" | "warn" | "risk"; label: string };
export type MarkActionRow = { name: string; meta?: string; badge?: string; href?: string };
export type MarkActionApproval = { kind: "campaign"; campaignId: string; assetId: string };
export type MarkActionCard = {
  kind: "result" | "draft";
  title: string;
  href?: string;
  rows: MarkActionRow[];
  preview?: string;
  flags: MarkActionFlag[];
  approval?: MarkActionApproval;
  // Self-describing fields so a card stands alone in a campaign deck / asset library.
  media?: MarkMedia; // the asset's own visual
  channel?: string; // "Meta / Instagram" | "Email" | "SMS" | …
  format?: string; // aspect/format label
  status?: MarkAssetStatus;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function parseRows(value: unknown): MarkActionRow[] {
  if (!Array.isArray(value)) return [];
  const out: MarkActionRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const name = str((item as { name?: unknown }).name);
    if (!name) continue;
    out.push({
      name,
      meta: str((item as { meta?: unknown }).meta),
      badge: str((item as { badge?: unknown }).badge),
      href: str((item as { href?: unknown }).href),
    });
  }
  return out;
}

function parseFlags(value: unknown): MarkActionFlag[] {
  if (!Array.isArray(value)) return [];
  const tones = new Set(["ok", "warn", "risk"]);
  const out: MarkActionFlag[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const tone = (item as { tone?: unknown }).tone;
    const label = str((item as { label?: unknown }).label);
    if (typeof tone !== "string" || !tones.has(tone) || !label) continue;
    out.push({ tone: tone as MarkActionFlag["tone"], label });
  }
  return out;
}

function parseApproval(value: unknown): MarkActionApproval | undefined {
  if (!value || typeof value !== "object") return undefined;
  const kind = (value as { kind?: unknown }).kind;
  const campaignId = str((value as { campaignId?: unknown }).campaignId);
  const assetId = str((value as { assetId?: unknown }).assetId);
  if (kind !== "campaign" || !campaignId || !assetId) return undefined;
  return { kind: "campaign", campaignId, assetId };
}

/** Parse Mark's structured action cards from message metadata. Defensive: drops
 *  malformed entries (must have a valid kind + title), never throws. */
export function parseActions(value: unknown): MarkActionCard[] {
  if (!Array.isArray(value)) return [];
  const out: MarkActionCard[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const kind = (item as { kind?: unknown }).kind;
    const title = str((item as { title?: unknown }).title);
    if ((kind !== "result" && kind !== "draft") || !title) continue;
    const mediaValue = (item as { media?: unknown }).media;
    const media = mediaValue ? parseMedia([mediaValue])[0] : undefined;
    const statusRaw = (item as { status?: unknown }).status;
    const status =
      typeof statusRaw === "string" && (ASSET_STATUSES as readonly string[]).includes(statusRaw)
        ? (statusRaw as MarkAssetStatus)
        : undefined;
    out.push({
      kind,
      title,
      href: str((item as { href?: unknown }).href),
      rows: parseRows((item as { rows?: unknown }).rows),
      preview: str((item as { preview?: unknown }).preview),
      flags: parseFlags((item as { flags?: unknown }).flags),
      approval: parseApproval((item as { approval?: unknown }).approval),
      media,
      channel: str((item as { channel?: unknown }).channel),
      format: str((item as { format?: unknown }).format),
      status,
    });
  }
  return out;
}
