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

export type ParsedCampaignDraft = {
  name: string;
  persona: string;
  restorationFocus: RestorationFocus;
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

  const restorationFocus = typeof obj.restorationFocus === "string" ? obj.restorationFocus.trim() : "";
  if (!(RESTORATION_FOCUS_VALUES as readonly string[]).includes(restorationFocus)) {
    throw new CampaignDraftValidationError("Choose a valid restoration focus.");
  }

  return {
    name,
    persona,
    restorationFocus: restorationFocus as RestorationFocus,
    channel: optionalTrimmed(obj.channel, "channel"),
    audienceSummary: optionalTrimmed(obj.audienceSummary, "audienceSummary"),
    objective: optionalTrimmed(obj.objective, "objective"),
    offerSummary: optionalTrimmed(obj.offerSummary, "offerSummary"),
    leadId: optionalUuid(obj.leadId, "leadId"),
    companyId: optionalUuid(obj.companyId, "companyId"),
  };
}
