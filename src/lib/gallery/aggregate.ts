export type DispatchFunnel = {
  queued: number;
  scheduled: number;
  sent: number;
  delivered: number;
  failed: number;
  canceled: number;
  total: number;
};

export type CampaignMetrics = {
  impressions: number;
  clicks: number;
  calls: number;
  forms: number;
  leads: number;
  jobs: number;
  wonRevenueCents: number;
  spendCents: number;
  ctr: number | null;
  costPerLeadCents: number | null;
  roi: number | null;
  hasData: boolean;
};

export type GalleryCampaign = {
  id: string;
  name: string;
  persona: string;
  href: string;
  thumbnailUrl: string | null;
  assetTypes: string[];
  assetCount: number;
  mediaCount: number;
  dispatch: DispatchFunnel;
  metrics: CampaignMetrics;
};

export type GalleryTotals = {
  campaigns: number;
  dispatch: DispatchFunnel;
  metrics: CampaignMetrics;
};

export type CampaignResultMetricRow = {
  impressions: number | null;
  clicks: number | null;
  calls: number | null;
  forms: number | null;
  leads: number | null;
  jobs: number | null;
  won_revenue_cents: number | null;
  spend_cents: number | null;
};

const EMPTY_FUNNEL: DispatchFunnel = { queued: 0, scheduled: 0, sent: 0, delivered: 0, failed: 0, canceled: 0, total: 0 };

/** Pure: count dispatch rows into the lifecycle funnel. Unknown statuses are ignored. */
export function countDispatchFunnel(rows: Array<{ status: string }>): DispatchFunnel {
  const funnel: DispatchFunnel = { ...EMPTY_FUNNEL };
  for (const row of rows) {
    if (row.status in funnel && row.status !== "total") {
      funnel[row.status as keyof DispatchFunnel] += 1;
      funnel.total += 1;
    }
  }
  return funnel;
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function deriveRates(metrics: { impressions: number; clicks: number; leads: number; spendCents: number; wonRevenueCents: number }) {
  return {
    ctr: metrics.impressions > 0 ? metrics.clicks / metrics.impressions : null,
    costPerLeadCents: metrics.leads > 0 ? Math.round(metrics.spendCents / metrics.leads) : null,
    roi: metrics.spendCents > 0 ? metrics.wonRevenueCents / metrics.spendCents : null,
  };
}

/** Pure: sum campaign_results rows into a CampaignMetrics with derived rates. */
export function aggregateCampaignResults(rows: CampaignResultMetricRow[]): CampaignMetrics {
  const summed = { impressions: 0, clicks: 0, calls: 0, forms: 0, leads: 0, jobs: 0, wonRevenueCents: 0, spendCents: 0 };
  for (const row of rows) {
    summed.impressions += num(row.impressions);
    summed.clicks += num(row.clicks);
    summed.calls += num(row.calls);
    summed.forms += num(row.forms);
    summed.leads += num(row.leads);
    summed.jobs += num(row.jobs);
    summed.wonRevenueCents += num(row.won_revenue_cents);
    summed.spendCents += num(row.spend_cents);
  }
  return { ...summed, ...deriveRates(summed), hasData: rows.length > 0 };
}

/** Pure: roll up gallery campaigns into top-line totals. */
export function aggregateTotals(campaigns: GalleryCampaign[]): GalleryTotals {
  const dispatch: DispatchFunnel = { ...EMPTY_FUNNEL };
  const summed = { impressions: 0, clicks: 0, calls: 0, forms: 0, leads: 0, jobs: 0, wonRevenueCents: 0, spendCents: 0 };
  let hasData = false;

  for (const campaign of campaigns) {
    for (const key of Object.keys(dispatch) as Array<keyof DispatchFunnel>) {
      dispatch[key] += campaign.dispatch[key];
    }
    summed.impressions += campaign.metrics.impressions;
    summed.clicks += campaign.metrics.clicks;
    summed.calls += campaign.metrics.calls;
    summed.forms += campaign.metrics.forms;
    summed.leads += campaign.metrics.leads;
    summed.jobs += campaign.metrics.jobs;
    summed.wonRevenueCents += campaign.metrics.wonRevenueCents;
    summed.spendCents += campaign.metrics.spendCents;
    hasData = hasData || campaign.metrics.hasData;
  }

  return { campaigns: campaigns.length, dispatch, metrics: { ...summed, ...deriveRates(summed), hasData } };
}
