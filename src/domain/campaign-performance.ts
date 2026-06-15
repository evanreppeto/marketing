type OutcomeRow = {
  lead_id: string | null;
  company_id: string | null;
  status: string | null;
  gross_revenue_cents: number | null;
  gross_margin_cents: number | null;
};

type JobRow = {
  lead_id: string | null;
  status: string | null;
  estimated_revenue_cents: number | null;
};

type EventRow = {
  event_type: string | null;
  channel: string | null;
};

/** Won set mirrors the existing performance read-model. */
const WON_STATUSES = ["won", "closed_won", "paid"];

export type CampaignMoney = {
  realizedRevenueCents: number;
  marginCents: number;
  wonCount: number;
  outcomeCount: number;
  estimatedPipelineCents: number;
  jobCount: number;
  hasData: boolean;
};

export type CampaignTraffic = {
  totalEvents: number;
  byType: Array<{ label: string; count: number }>;
  byChannel: Array<{ label: string; count: number }>;
  hasData: boolean;
};

/** Money attributed to a campaign via its already-matched outcomes + jobs.
 *  Returns raw cents/counts; presentation formats currency. */
export function summarizeCampaignMoney(outcomes: OutcomeRow[], jobs: JobRow[]): CampaignMoney {
  const realizedRevenueCents = outcomes.reduce((sum, o) => sum + (o.gross_revenue_cents ?? 0), 0);
  const marginCents = outcomes.reduce((sum, o) => sum + (o.gross_margin_cents ?? 0), 0);
  const wonCount = outcomes.filter((o) => WON_STATUSES.includes(o.status ?? "")).length;
  const estimatedPipelineCents = jobs.reduce((sum, j) => sum + (j.estimated_revenue_cents ?? 0), 0);
  return {
    realizedRevenueCents,
    marginCents,
    wonCount,
    outcomeCount: outcomes.length,
    estimatedPipelineCents,
    jobCount: jobs.length,
    hasData: outcomes.length > 0 || jobs.length > 0,
  };
}

function groupCounts(labels: string[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/** Internal engagement events (already filtered to one campaign) grouped by type/channel. */
export function summarizeCampaignTraffic(events: EventRow[]): CampaignTraffic {
  const byType = groupCounts(events.map((e) => (e.event_type?.trim() ? e.event_type.trim() : "Other")));
  const byChannel = groupCounts(events.map((e) => (e.channel?.trim() ? e.channel.trim() : "Unassigned")));
  return {
    totalEvents: events.length,
    byType,
    byChannel,
    hasData: events.length > 0,
  };
}
