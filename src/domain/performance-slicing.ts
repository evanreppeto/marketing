/** Pure aggregation of campaign results into "what's working" slices. No I/O. */
export type SliceDimension = "persona" | "channel" | "asset_type";

export type ResultRow = {
  persona: string | null;
  channel: string | null;
  assetType: string | null;
  impressions: number;
  clicks: number;
  leads: number;
  jobs: number;
  wonRevenueCents: number;
  spendCents: number;
};

export type SliceStat = {
  key: string;
  impressions: number;
  clicks: number;
  leads: number;
  jobs: number;
  wonRevenueCents: number;
  spendCents: number;
  /** won_revenue / spend; null when no spend. */
  roas: number | null;
  /** cost per lead in cents; null when no leads. */
  cpl: number | null;
  /** clicks / impressions; null when no impressions. */
  ctr: number | null;
  /** number of result rows in this slice. */
  sampleSize: number;
};

function keyFor(row: ResultRow, dim: SliceDimension): string {
  const v = dim === "persona" ? row.persona : dim === "channel" ? row.channel : row.assetType;
  return v ?? "unknown";
}

export function aggregateBySlice(rows: ResultRow[], dimension: SliceDimension): SliceStat[] {
  const map = new Map<string, SliceStat>();
  for (const row of rows) {
    const key = keyFor(row, dimension);
    const s =
      map.get(key) ??
      { key, impressions: 0, clicks: 0, leads: 0, jobs: 0, wonRevenueCents: 0, spendCents: 0, roas: null, cpl: null, ctr: null, sampleSize: 0 };
    s.impressions += row.impressions;
    s.clicks += row.clicks;
    s.leads += row.leads;
    s.jobs += row.jobs;
    s.wonRevenueCents += row.wonRevenueCents;
    s.spendCents += row.spendCents;
    s.sampleSize += 1;
    map.set(key, s);
  }
  const out = [...map.values()].map((s) => ({
    ...s,
    roas: s.spendCents > 0 ? s.wonRevenueCents / s.spendCents : null,
    cpl: s.leads > 0 ? s.spendCents / s.leads : null,
    ctr: s.impressions > 0 ? s.clicks / s.impressions : null,
  }));
  out.sort((a, b) => b.jobs - a.jobs || (b.roas ?? 0) - (a.roas ?? 0));
  return out;
}
