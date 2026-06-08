export class CampaignResultsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignResultsValidationError";
  }
}

export type ParsedCampaignResult = {
  campaign_id: string;
  campaign_asset_id: string | null;
  channel: string | null;
  period_start: string;
  period_end: string;
  impressions: number;
  clicks: number;
  calls: number;
  forms: number;
  leads: number;
  jobs: number;
  won_revenue_cents: number;
  spend_cents: number;
  metadata: Record<string, unknown>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const METRIC_KEYS = ["impressions", "clicks", "calls", "forms", "leads", "jobs", "won_revenue_cents", "spend_cents"] as const;

function asObject(value: unknown, index: number): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CampaignResultsValidationError(`Result at index ${index} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonNegativeInt(value: unknown, field: string, index: number): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "${field}" must be a non-negative integer.`);
  }
  return value;
}

function parseOne(raw: unknown, index: number): ParsedCampaignResult {
  const obj = asObject(raw, index);

  const campaignId = obj.campaign_id;
  if (typeof campaignId !== "string" || !UUID_RE.test(campaignId)) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "campaign_id" must be a valid UUID.`);
  }

  const periodStart = obj.period_start;
  const periodEnd = obj.period_end;
  if (typeof periodStart !== "string" || !DATE_RE.test(periodStart) || typeof periodEnd !== "string" || !DATE_RE.test(periodEnd)) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "period_start"/"period_end" must be YYYY-MM-DD dates.`);
  }
  if (periodEnd < periodStart) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "period_end" must not be before "period_start".`);
  }

  const metrics = Object.fromEntries(METRIC_KEYS.map((key) => [key, nonNegativeInt(obj[key], key, index)])) as Record<
    (typeof METRIC_KEYS)[number],
    number
  >;

  const assetId = obj.campaign_asset_id;
  if (assetId !== undefined && assetId !== null && (typeof assetId !== "string" || !UUID_RE.test(assetId))) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "campaign_asset_id" must be a UUID when provided.`);
  }

  const channel = obj.channel;
  if (channel !== undefined && channel !== null && typeof channel !== "string") {
    throw new CampaignResultsValidationError(`Result at index ${index}: "channel" must be a string when provided.`);
  }

  const metadata = obj.metadata;
  if (metadata !== undefined && (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))) {
    throw new CampaignResultsValidationError(`Result at index ${index}: "metadata" must be an object when provided.`);
  }

  return {
    campaign_id: campaignId,
    campaign_asset_id: (assetId as string | undefined) ?? null,
    channel: (channel as string | undefined) ?? null,
    period_start: periodStart,
    period_end: periodEnd,
    ...metrics,
    metadata: (metadata as Record<string, unknown> | undefined) ?? {},
  };
}

/** Pure: validate + normalize one result or an array of results. Throws on bad input. */
export function parseCampaignResultsPayload(payload: unknown): ParsedCampaignResult[] {
  const list = Array.isArray(payload) ? payload : [payload];
  if (list.length === 0) {
    throw new CampaignResultsValidationError("Provide at least one campaign result.");
  }
  return list.map((entry, index) => parseOne(entry, index));
}
