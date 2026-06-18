// ---------------------------------------------------------------------------
// Per-campaign analytics demo detail — the rich single-campaign view used at
// /analytics/[campaignId] when Supabase isn't configured (local preview,
// screenshots, sales demos). Numbers are believable but synthetic; the model
// flags them via `isDemo: true`. Analytics is read-only display — nothing here
// implies an outbound send. Mirrors the campaign ids in the overview demo
// dataset (buildDemoPerformanceReadModel) so the analytics table links resolve.
// ---------------------------------------------------------------------------

export type CampaignDetailKpi = {
  key: string;
  label: string;
  value: string;
  hint: string;
  delta: string;
  deltaTone: "ok" | "amber" | "red" | "neutral";
  /** Raw series the UI normalizes into a tiny inline sparkline. */
  spark: number[];
};

/** One bucket of the performance-over-time chart (one week). */
export type CampaignDetailTrendPoint = {
  week: string;
  leads: number;
  booked: number;
  /** Marketing-attributed revenue for the week, in whole dollars. */
  revenue: number;
};

export type CampaignDetailChannelRow = {
  channel: string;
  leads: number;
  booked: number;
  revenueCents: number;
  spendCents: number;
  share: number;
};

export type CampaignDetailFunnelStage = {
  label: string;
  count: number;
};

/** One produced asset/deliverable row with its provenance + approval state. */
export type CampaignDetailAssetRow = {
  id: string;
  title: string;
  channel: string;
  format: string;
  source: "Real BSR media" | "AI-generated" | "Composite" | "Stock";
  status: "Approved" | "Needs review" | "Draft" | "Rejected";
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number;
};

export type CampaignAnalyticsDemoDetail = {
  isDemo: true;
  id: string;
  name: string;
  persona: string;
  lifecycle: string;
  objective: string;
  updatedAt: string;
  windowLabel: string;
  kpis: CampaignDetailKpi[];
  trend: CampaignDetailTrendPoint[];
  channels: CampaignDetailChannelRow[];
  funnel: CampaignDetailFunnelStage[];
  assets: CampaignDetailAssetRow[];
  /** Approval readiness for the visible outbound-locked gate. */
  approval: {
    approved: number;
    pending: number;
    draft: number;
    readiness: number;
  };
};

/** Deterministic pseudo-random so each campaign's demo is stable across renders. */
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("en-US");

type DemoCampaignSeed = {
  id: string;
  name: string;
  persona: string;
  lifecycle: string;
  objective: string;
  impressions: number;
  clicks: number;
  leads: number;
  booked: number;
  revenueCents: number;
  spendCents: number;
  conversion: number;
  /** Per-channel lead split — channel label → weight (normalized internally). */
  channelMix: Array<{ channel: string; weight: number; spendShare: number }>;
  assets: Array<Omit<CampaignDetailAssetRow, "impressions" | "clicks" | "leads" | "ctr"> & { weight: number }>;
  seed: number;
};

const CAMPAIGN_SEEDS: DemoCampaignSeed[] = [
  {
    id: "demo-emergency-water-response-2026",
    name: "Emergency Water Response 2026",
    persona: "Distressed Homeowner",
    lifecycle: "Live",
    objective:
      "Capture high-urgency water-damage demand the moment it spikes and route booked work to the rapid-response crew, with creative built from approved BSR before/after restoration media.",
    impressions: 68_400,
    clicks: 3_120,
    leads: 188,
    booked: 31,
    revenueCents: 7_240_000,
    spendCents: 1_180_000,
    conversion: 16,
    channelMix: [
      { channel: "Meta Ads", weight: 0.34, spendShare: 0.74 },
      { channel: "Landing", weight: 0.24, spendShare: 0 },
      { channel: "Email", weight: 0.2, spendShare: 0 },
      { channel: "SMS", weight: 0.13, spendShare: 0 },
      { channel: "Referral", weight: 0.09, spendShare: 0.26 },
    ],
    assets: [
      { id: "a1", title: "Flooded basement — 9:16 reel", channel: "Meta Ads", format: "9:16 MP4", source: "Real BSR media", status: "Approved", weight: 0.3 },
      { id: "a2", title: "24/7 rapid response — 1:1 static", channel: "Meta Ads", format: "1:1 PNG", source: "Real BSR media", status: "Approved", weight: 0.24 },
      { id: "a3", title: "Water damage hotline — 4:5 static", channel: "Meta Ads", format: "4:5 PNG", source: "Composite", status: "Approved", weight: 0.18 },
      { id: "a4", title: "Emergency response landing one-pager", channel: "Landing", format: "Landing", source: "Real BSR media", status: "Approved", weight: 0.16 },
      { id: "a5", title: "Storm-night intake email", channel: "Email", format: "Email", source: "Composite", status: "Needs review", weight: 0.12 },
    ],
    seed: 1011,
  },
  {
    id: "demo-spring-storm-prep",
    name: "Spring Storm Prep",
    persona: "Proactive Homeowner",
    lifecycle: "Live",
    objective:
      "Get ahead of storm-season demand with preventative messaging so proactive homeowners book inspections before the first big front, smoothing crew capacity.",
    impressions: 52_100,
    clicks: 2_410,
    leads: 142,
    booked: 18,
    revenueCents: 3_960_000,
    spendCents: 640_000,
    conversion: 13,
    channelMix: [
      { channel: "Email", weight: 0.32, spendShare: 0 },
      { channel: "Meta Ads", weight: 0.26, spendShare: 0.68 },
      { channel: "Landing", weight: 0.22, spendShare: 0 },
      { channel: "SMS", weight: 0.12, spendShare: 0 },
      { channel: "Referral", weight: 0.08, spendShare: 0.32 },
    ],
    assets: [
      { id: "a1", title: "Storm-prep checklist — carousel", channel: "Meta Ads", format: "1:1 PNG", source: "Composite", status: "Approved", weight: 0.28 },
      { id: "a2", title: "Pre-season inspection email", channel: "Email", format: "Email", source: "Real BSR media", status: "Approved", weight: 0.26 },
      { id: "a3", title: "Gutter & sump readiness — 4:5", channel: "Meta Ads", format: "4:5 PNG", source: "Real BSR media", status: "Approved", weight: 0.2 },
      { id: "a4", title: "Priority scheduling landing variant", channel: "Landing", format: "Landing", source: "Composite", status: "Needs review", weight: 0.16 },
      { id: "a5", title: "Storm-watch SMS nudge", channel: "SMS", format: "SMS", source: "AI-generated", status: "Draft", weight: 0.1 },
    ],
    seed: 2022,
  },
  {
    id: "demo-commercial-water-mitigation",
    name: "Commercial Water Mitigation",
    persona: "Property Manager",
    lifecycle: "Live",
    objective:
      "Win standing-relationship mitigation contracts with property managers by leading with response-time SLAs and documented commercial restoration proof.",
    impressions: 31_900,
    clicks: 1_180,
    leads: 74,
    booked: 14,
    revenueCents: 5_120_000,
    spendCents: 410_000,
    conversion: 19,
    channelMix: [
      { channel: "Email", weight: 0.34, spendShare: 0 },
      { channel: "Referral", weight: 0.24, spendShare: 0.3 },
      { channel: "Landing", weight: 0.2, spendShare: 0 },
      { channel: "Meta Ads", weight: 0.14, spendShare: 0.7 },
      { channel: "SMS", weight: 0.08, spendShare: 0 },
    ],
    assets: [
      { id: "a1", title: "Commercial SLA one-pager (PDF)", channel: "Landing", format: "PDF", source: "Real BSR media", status: "Approved", weight: 0.3 },
      { id: "a2", title: "PM reactivation email sequence", channel: "Email", format: "Email", source: "Composite", status: "Approved", weight: 0.26 },
      { id: "a3", title: "Multi-unit mitigation case study", channel: "Landing", format: "Landing", source: "Real BSR media", status: "Approved", weight: 0.22 },
      { id: "a4", title: "Property-manager referral packet", channel: "Referral", format: "PDF", source: "Composite", status: "Needs review", weight: 0.14 },
      { id: "a5", title: "Facilities LinkedIn static", channel: "Meta Ads", format: "1:1 PNG", source: "AI-generated", status: "Draft", weight: 0.08 },
    ],
    seed: 3033,
  },
  {
    id: "demo-mold-remediation-awareness",
    name: "Mold Remediation Awareness",
    persona: "Health-Conscious Homeowner",
    lifecycle: "In review",
    objective:
      "Educate health-conscious homeowners on hidden moisture and mold risk, qualifying inquiries up-front so the landing form sends booking-ready leads to the crew.",
    impressions: 28_600,
    clicks: 1_040,
    leads: 61,
    booked: 8,
    revenueCents: 1_840_000,
    spendCents: 350_000,
    conversion: 13,
    channelMix: [
      { channel: "Landing", weight: 0.3, spendShare: 0 },
      { channel: "Meta Ads", weight: 0.28, spendShare: 0.82 },
      { channel: "Email", weight: 0.22, spendShare: 0 },
      { channel: "SMS", weight: 0.12, spendShare: 0 },
      { channel: "Referral", weight: 0.08, spendShare: 0.18 },
    ],
    assets: [
      { id: "a1", title: "Hidden-mold explainer — 9:16", channel: "Meta Ads", format: "9:16 MP4", source: "Composite", status: "Approved", weight: 0.28 },
      { id: "a2", title: "Air-quality awareness email", channel: "Email", format: "Email", source: "Real BSR media", status: "Approved", weight: 0.24 },
      { id: "a3", title: "Mold inspection landing page", channel: "Landing", format: "Landing", source: "Composite", status: "Needs review", weight: 0.22 },
      { id: "a4", title: "Qualifying-question form variant", channel: "Landing", format: "Landing", source: "AI-generated", status: "Needs review", weight: 0.16 },
      { id: "a5", title: "Before/after mold static", channel: "Meta Ads", format: "4:5 PNG", source: "Real BSR media", status: "Draft", weight: 0.1 },
    ],
    seed: 4044,
  },
  {
    id: "demo-burst-pipe-rapid-response",
    name: "Burst Pipe Rapid Response",
    persona: "Distressed Homeowner",
    lifecycle: "Live",
    objective:
      "Intercept burst-pipe emergencies in cold snaps with always-on rapid-response creative, converting urgent searches into same-day booked mitigation.",
    impressions: 19_300,
    clicks: 980,
    leads: 58,
    booked: 7,
    revenueCents: 1_690_000,
    spendCents: 280_000,
    conversion: 12,
    channelMix: [
      { channel: "Meta Ads", weight: 0.36, spendShare: 0.8 },
      { channel: "SMS", weight: 0.22, spendShare: 0 },
      { channel: "Landing", weight: 0.2, spendShare: 0 },
      { channel: "Email", weight: 0.14, spendShare: 0 },
      { channel: "Referral", weight: 0.08, spendShare: 0.2 },
    ],
    assets: [
      { id: "a1", title: "Frozen-pipe night static — 1:1", channel: "Meta Ads", format: "1:1 PNG", source: "Real BSR media", status: "Approved", weight: 0.3 },
      { id: "a2", title: "Same-day mitigation SMS", channel: "SMS", format: "SMS", source: "Composite", status: "Approved", weight: 0.24 },
      { id: "a3", title: "Cold-snap landing variant", channel: "Landing", format: "Landing", source: "Composite", status: "Approved", weight: 0.2 },
      { id: "a4", title: "Shut-off-valve explainer — 9:16", channel: "Meta Ads", format: "9:16 MP4", source: "AI-generated", status: "Needs review", weight: 0.16 },
      { id: "a5", title: "Burst-pipe intake email", channel: "Email", format: "Email", source: "Composite", status: "Draft", weight: 0.1 },
    ],
    seed: 5055,
  },
  {
    id: "demo-insurance-partner-referral",
    name: "Insurance Partner Referral",
    persona: "Insurance Adjuster",
    lifecycle: "In review",
    objective:
      "Build a steady referral pipeline with insurance adjusters by packaging documentation-quality restoration proof and a clean partner handoff.",
    impressions: 14_500,
    clicks: 540,
    leads: 41,
    booked: 4,
    revenueCents: 1_020_000,
    spendCents: 90_000,
    conversion: 10,
    channelMix: [
      { channel: "Referral", weight: 0.4, spendShare: 0.4 },
      { channel: "Email", weight: 0.3, spendShare: 0 },
      { channel: "Landing", weight: 0.16, spendShare: 0 },
      { channel: "Meta Ads", weight: 0.08, spendShare: 0.6 },
      { channel: "SMS", weight: 0.06, spendShare: 0 },
    ],
    assets: [
      { id: "a1", title: "Adjuster referral packet (PDF)", channel: "Referral", format: "PDF", source: "Real BSR media", status: "Approved", weight: 0.34 },
      { id: "a2", title: "Documentation-quality proof email", channel: "Email", format: "Email", source: "Real BSR media", status: "Approved", weight: 0.26 },
      { id: "a3", title: "Partner co-marketing landing", channel: "Landing", format: "Landing", source: "Composite", status: "Needs review", weight: 0.2 },
      { id: "a4", title: "Claims handoff one-pager", channel: "Referral", format: "PDF", source: "Composite", status: "Needs review", weight: 0.12 },
      { id: "a5", title: "Adjuster outreach static", channel: "Meta Ads", format: "1:1 PNG", source: "AI-generated", status: "Draft", weight: 0.08 },
    ],
    seed: 6066,
  },
];

function buildTrend(seed: DemoCampaignSeed): CampaignDetailTrendPoint[] {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const weeks = 12;
  const rng = seeded(seed.seed);
  const points: CampaignDetailTrendPoint[] = [];

  // Distribute the campaign's total leads/booked/revenue across 12 weeks with a
  // gentle upward ramp plus a mid-window spike, so the curve reads like real
  // delivery rather than a flat line. Weekly values are scaled to hit the totals.
  const rampWeights: number[] = [];
  for (let i = 0; i < weeks; i++) {
    const progress = i / (weeks - 1);
    const spike = i >= 5 && i <= 7 ? 0.5 : 0;
    rampWeights.push(0.55 + progress * 0.7 + spike + (rng() - 0.5) * 0.18);
  }
  const weightSum = rampWeights.reduce((s, w) => s + w, 0);

  for (let i = 0; i < weeks; i++) {
    const start = now - (weeks - 1 - i) * 7 * DAY_MS;
    const label = new Date(start).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    const fraction = rampWeights[i] / weightSum;
    points.push({
      week: label,
      leads: Math.max(0, Math.round(seed.leads * fraction)),
      booked: Math.max(0, Math.round(seed.booked * fraction)),
      revenue: Math.max(0, Math.round((seed.revenueCents / 100) * fraction)),
    });
  }
  return points;
}

function buildChannels(seed: DemoCampaignSeed): CampaignDetailChannelRow[] {
  const mixSum = seed.channelMix.reduce((s, c) => s + c.weight, 0);
  const rows = seed.channelMix.map((c) => {
    const share = c.weight / mixSum;
    const leads = Math.round(seed.leads * share);
    const booked = Math.round(seed.booked * share);
    const revenueCents = Math.round(seed.revenueCents * share);
    const spendCents = Math.round(seed.spendCents * c.spendShare);
    return { channel: c.channel, leads, booked, revenueCents, spendCents, share: Math.round(share * 100) };
  });
  return rows.sort((a, b) => b.leads - a.leads);
}

function buildAssets(seed: DemoCampaignSeed): CampaignDetailAssetRow[] {
  const rng = seeded(seed.seed + 7);
  const weightSum = seed.assets.reduce((s, a) => s + a.weight, 0);
  return seed.assets.map((a) => {
    const share = a.weight / weightSum;
    const impressions = Math.round(seed.impressions * share);
    const ctrBase = (seed.clicks / Math.max(seed.impressions, 1)) * (0.8 + rng() * 0.5);
    const clicks = Math.max(1, Math.round(impressions * ctrBase));
    const leads = Math.max(0, Math.round(seed.leads * share));
    const ctr = Math.round((clicks / Math.max(impressions, 1)) * 1000) / 10;
    return {
      id: a.id,
      title: a.title,
      channel: a.channel,
      format: a.format,
      source: a.source,
      status: a.status,
      impressions,
      clicks,
      leads,
      ctr,
    };
  });
}

export function getCampaignAnalyticsDemoDetail(campaignId: string): CampaignAnalyticsDemoDetail | null {
  const seed = CAMPAIGN_SEEDS.find((c) => c.id === campaignId);
  if (!seed) return null;

  const trend = buildTrend(seed);
  const channels = buildChannels(seed);
  const assets = buildAssets(seed);

  const ctrPct = Math.round((seed.clicks / Math.max(seed.impressions, 1)) * 1000) / 10;
  const cplCents = Math.round(seed.spendCents / Math.max(seed.leads, 1));
  const cpbCents = Math.round(seed.spendCents / Math.max(seed.booked, 1));

  const leadSpark = trend.map((p) => p.leads);
  const bookedSpark = trend.map((p) => p.booked);
  const revenueSpark = trend.map((p) => p.revenue);
  const ctrSpark = trend.map((p) => (p.leads > 0 ? p.leads : 0));

  const kpis: CampaignDetailKpi[] = [
    { key: "leads", label: "Leads", value: NUM.format(seed.leads), hint: "qualified this campaign", delta: "+18%", deltaTone: "ok", spark: leadSpark },
    { key: "booked", label: "Booked work", value: NUM.format(seed.booked), hint: "jobs attributed", delta: "+12%", deltaTone: "ok", spark: bookedSpark },
    { key: "revenue", label: "Revenue impact", value: USD.format(seed.revenueCents / 100), hint: "marketing-attributed", delta: "+24%", deltaTone: "ok", spark: revenueSpark },
    { key: "conversion", label: "Lead → booked", value: `${seed.conversion}%`, hint: "qualified leads booked", delta: "+3 pts", deltaTone: "ok", spark: ctrSpark },
    { key: "ctr", label: "Click-through", value: `${ctrPct}%`, hint: `${NUM.format(seed.clicks)} clicks`, delta: "+0.4 pts", deltaTone: "ok", spark: ctrSpark },
    {
      key: "cpb",
      label: "Cost / booked job",
      value: seed.spendCents > 0 ? USD.format(cpbCents / 100) : "—",
      hint: seed.spendCents > 0 ? `${USD.format(cplCents / 100)} per lead` : "no paid spend",
      delta: "-9%",
      deltaTone: "ok",
      spark: bookedSpark,
    },
  ];

  const funnel: CampaignDetailFunnelStage[] = [
    { label: "Impressions", count: seed.impressions },
    { label: "Clicks", count: seed.clicks },
    { label: "Leads", count: seed.leads },
    { label: "Booked", count: seed.booked },
  ];

  const approved = assets.filter((a) => a.status === "Approved").length;
  const pending = assets.filter((a) => a.status === "Needs review").length;
  const draft = assets.filter((a) => a.status === "Draft" || a.status === "Rejected").length;
  const readiness = assets.length > 0 ? Math.round((approved / assets.length) * 100) : 0;

  return {
    isDemo: true,
    id: seed.id,
    name: seed.name,
    persona: seed.persona,
    lifecycle: seed.lifecycle,
    objective: seed.objective,
    updatedAt: "2h ago",
    windowLabel: "Last 90 days",
    kpis,
    trend,
    channels,
    funnel,
    assets,
    approval: { approved, pending, draft, readiness },
  };
}

/** True when this id has a demo analytics detail — lets the route try the
 *  fallback before showing the "unavailable" empty state. */
export function isDemoCampaignAnalyticsId(campaignId: string): boolean {
  return CAMPAIGN_SEEDS.some((c) => c.id === campaignId);
}

export { USD as demoUsd, NUM as demoNum };
