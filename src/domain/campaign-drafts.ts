import { isOfficialPersonaMapping } from "./personas";

export class CampaignDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignDraftValidationError";
  }
}

export const RESTORATION_FOCUS_VALUES = [
  "flood",
  "water_backup",
  "burst_pipe",
  "storm_surge",
  "standing_water",
  "mold",
  "sewage",
  "fire",
] as const;

export type RestorationFocus = (typeof RESTORATION_FOCUS_VALUES)[number];

const RESTORATION_FOCUS_SET = new Set<string>(RESTORATION_FOCUS_VALUES);

/**
 * Aliases the agent's tool descriptions historically suggested (e.g. "water",
 * "storm") that are NOT enum members. Mapped to the real value so an Arc draft
 * lands instead of failing as a late Postgres 502. Every value MUST be a real
 * RestorationFocus.
 */
const RESTORATION_FOCUS_ALIASES: Record<string, RestorationFocus> = {
  water: "water_backup",
  water_damage: "water_backup",
  storm: "storm_surge",
  storm_damage: "storm_surge",
  flooding: "flood",
  sewer: "sewage",
  fire_damage: "fire",
};

/**
 * Normalize a free-string restoration focus to a valid `restoration_focus`,
 * applying the alias map first. Returns null when unresolved so the caller can
 * reject with a clean 400 rather than a late enum 502.
 */
export function normalizeRestorationFocus(value: unknown): RestorationFocus | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v.length === 0) return null;
  if (RESTORATION_FOCUS_SET.has(v)) return v as RestorationFocus;
  return RESTORATION_FOCUS_ALIASES[v] ?? null;
}

/**
 * Title-case a raw focus/theme token into readable theme text
 * ("water_backup" → "Water backup"). Used to seed the industry-neutral
 * `campaignTheme` from a legacy `restorationFocus` when no explicit theme is given.
 */
export function humanizeCampaignFocus(value: string): string {
  const s = (value || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

/**
 * Resolve the industry-neutral campaign theme from a draft's inputs: an explicit
 * `campaignTheme` wins; otherwise the legacy `restorationFocus` (enum or free
 * string) is humanized into theme text. Returns "" when neither is present.
 */
export function deriveCampaignTheme(campaignTheme: unknown, restorationFocus: unknown): string {
  const explicit = typeof campaignTheme === "string" ? campaignTheme.trim() : "";
  if (explicit) return explicit;
  const legacy = normalizeRestorationFocus(restorationFocus);
  if (legacy) return humanizeCampaignFocus(legacy);
  return typeof restorationFocus === "string" ? humanizeCampaignFocus(restorationFocus) : "";
}

export type ParsedCampaignDraft = {
  name: string;
  persona: string;
  /** Industry-neutral campaign theme (what the campaign is about) — free text. */
  campaignTheme: string;
  /** Legacy restoration enum value when the theme maps to one; "" otherwise.
   *  Kept only to populate the nullable legacy `restoration_focus` column. */
  restorationFocus: string;
  channel?: string;
  audienceSummary?: string;
  objective?: string;
  offerSummary?: string;
  leadId?: string;
  companyId?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CampaignDraftValidationError("Campaign draft must be an object.");
  }
  return value as Record<string, unknown>;
}

function optionalTrimmed(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new CampaignDraftValidationError(`"${field}" must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalUuid(value: unknown, field: string): string | undefined {
  const trimmed = optionalTrimmed(value, field);
  if (trimmed === undefined) return undefined;
  if (!UUID_RE.test(trimmed)) {
    throw new CampaignDraftValidationError(`"${field}" must be a valid UUID when provided.`);
  }
  return trimmed;
}

export type ParsedCampaignEdit = {
  name: string;
  audienceSummary?: string;
  objective?: string;
  offerSummary?: string;
};

/** Pure: validate + normalize an operator campaign edit (title required, rest optional). */
export function parseCampaignEdit(payload: unknown): ParsedCampaignEdit {
  const obj = asObject(payload);

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (name.length === 0) {
    throw new CampaignDraftValidationError("Give the campaign a title.");
  }

  return {
    name,
    audienceSummary: optionalTrimmed(obj.audienceSummary, "audienceSummary"),
    objective: optionalTrimmed(obj.objective, "objective"),
    offerSummary: optionalTrimmed(obj.offerSummary, "offerSummary"),
  };
}

/** Pure: validate + normalize an operator-authored campaign draft. Throws on bad input. */
export function parseCampaignDraft(payload: unknown): ParsedCampaignDraft {
  const obj = asObject(payload);

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (name.length === 0) {
    throw new CampaignDraftValidationError("Give the campaign a title.");
  }

  const persona = typeof obj.persona === "string" ? obj.persona.trim() : "";
  if (!isOfficialPersonaMapping(persona)) {
    throw new CampaignDraftValidationError("Choose who the campaign is for (a valid persona).");
  }

  // Industry-neutral: a free-text campaignTheme is the primary field. A legacy
  // restorationFocus still works (it maps to its enum value for the legacy column
  // and, absent an explicit theme, seeds the theme text). Non-restoration values
  // are no longer rejected — they carry through as the theme.
  const campaignTheme = deriveCampaignTheme(obj.campaignTheme, obj.restorationFocus);
  if (!campaignTheme) {
    throw new CampaignDraftValidationError("Give the campaign a theme (what it's about).");
  }
  const legacyFocus = normalizeRestorationFocus(obj.restorationFocus);

  return {
    name,
    persona,
    campaignTheme,
    restorationFocus: legacyFocus ?? "",
    channel: optionalTrimmed(obj.channel, "channel"),
    audienceSummary: optionalTrimmed(obj.audienceSummary, "audienceSummary"),
    objective: optionalTrimmed(obj.objective, "objective"),
    offerSummary: optionalTrimmed(obj.offerSummary, "offerSummary"),
    leadId: optionalUuid(obj.leadId, "leadId"),
    companyId: optionalUuid(obj.companyId, "companyId"),
  };
}
