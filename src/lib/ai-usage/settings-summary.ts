// ---------------------------------------------------------------------------
// Settings → Usage & billing inline summary. Wraps the (UI-unused) AI-usage
// read-model + the purpose-built summarizeUsageForSettings card into the shape
// the Settings Usage section renders. Live via loadWorkspaceUsage; a realistic
// BSR demo card in the offline preview (ARC_DEMO_DATA); zeros otherwise.
// Read-only display — the full breakdown lives on the Usage report.
// ---------------------------------------------------------------------------

import { summarizeUsageForSettings, type UsageSummaryCard } from "@/domain";
import { isDemoDataEnabled } from "@/lib/demo/demo-mode";

import { loadWorkspaceUsage } from "./read-model";

// Default monthly soft cap ($80) until a per-workspace cap field is wired.
const SOFT_CAP_CENTS = 8000;

export type SettingsUsageView = {
  isDemo: boolean;
  configured: boolean;
  tokensLabel: string;
  runsLabel: string;
  costLabel: string;
  capLabel: string;
  pctOfCap: number;
  isNearCap: boolean;
  rangeLabel: string;
};

const USD2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const USD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("en-US");

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return NUM.format(n);
}

/** Pure: a usage card → the Settings Usage view-model. */
export function toUsageView(card: UsageSummaryCard, isDemo: boolean, configured: boolean): SettingsUsageView {
  return {
    isDemo,
    configured,
    tokensLabel: formatTokens(card.totalTokens),
    runsLabel: NUM.format(card.totalRuns),
    costLabel: USD2.format(card.totalCostCents / 100),
    capLabel: USD0.format(SOFT_CAP_CENTS / 100),
    pctOfCap: card.pctOfCap,
    isNearCap: card.isNearCap,
    rangeLabel: "Last 30 days",
  };
}

const ZERO_CARD: UsageSummaryCard = { totalCostCents: 0, totalTokens: 0, totalRuns: 0, pctOfCap: 0, isNearCap: false };

function demoUsageView(): SettingsUsageView {
  // Believable BSR month: ~1.84M tokens, 312 agent runs, $48.80 → 61% of the $80 cap.
  const card: UsageSummaryCard = { totalCostCents: 4880, totalTokens: 1_842_000, totalRuns: 312, pctOfCap: 61, isNearCap: false };
  return toUsageView(card, true, true);
}

export async function getSettingsUsageView(): Promise<SettingsUsageView> {
  const usage = await loadWorkspaceUsage("30d").catch(() => null);
  if (usage?.configured) {
    return toUsageView(summarizeUsageForSettings(usage.summary, SOFT_CAP_CENTS), false, true);
  }

  if (isDemoDataEnabled()) return demoUsageView();

  return toUsageView(ZERO_CARD, false, false);
}
