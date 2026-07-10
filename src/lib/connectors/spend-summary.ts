// ---------------------------------------------------------------------------
// Settings → Usage "Connector spend" panel (BSR-372). Wraps the metered usage
// ledger + the workspace spend cap into the shape the Usage section renders:
// per-connector spend, remaining budget, and each metered connector's up-front
// cost disclosure. Live via the admin client scoped by workspace_id; a realistic
// BSR demo card in the offline preview (ARC_DEMO_DATA); zeros otherwise.
// Mirrors src/lib/ai-usage/settings-summary.ts.
// ---------------------------------------------------------------------------

import { type SupabaseClient } from "@supabase/supabase-js";

import {
  CONNECTOR_REGISTRY,
  DEFAULT_SPEND_CAP_CENTS,
  describeConnectorCost,
  findConnector,
  formatCents,
  summarizeConnectorSpend,
  type ConnectorUsageEvent,
} from "@/domain";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { isDemoDataEnabled } from "@/lib/demo/demo-mode";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { getSpendCapCents, periodStartIso } from "./metering";

export type ConnectorSpendRowView = {
  key: string;
  label: string;
  costCents: number;
  costLabel: string;
  units: number;
  count: number;
  /** Up-front cost disclosure, e.g. "~$8.00 per 100 lookups". */
  disclosure: string | null;
};

export type ConnectorSpendView = {
  isDemo: boolean;
  configured: boolean;
  capCents: number;
  /** Cap in whole dollars, for the cap-editor input default. */
  capDollars: number;
  capLabel: string;
  spentLabel: string;
  remainingLabel: string;
  pctOfCap: number;
  isNearCap: boolean;
  isOverCap: boolean;
  periodLabel: string;
  rows: ConnectorSpendRowView[];
};

const CONNECTOR_LABEL = (key: string): string => findConnector(key)?.label ?? key;

/** The metered connectors in the catalog — always shown, even at $0 spend. */
function meteredKeys(): string[] {
  return CONNECTOR_REGISTRY.filter((c) => c.costTier === "metered").map((c) => c.key);
}

/**
 * Pure: a set of period usage events + the cap → the Usage "Connector spend"
 * view-model. Every metered connector appears (with its rate) even when it has
 * spent nothing yet, so the disclosure is always visible.
 */
export function toConnectorSpendView(events: ConnectorUsageEvent[], capCents: number, isDemo: boolean, configured: boolean): ConnectorSpendView {
  const summary = summarizeConnectorSpend(events, capCents);
  const byKey = new Map(summary.byConnector.map((r) => [r.connectorKey, r]));

  // Union of metered catalog connectors and any connector that has spend rows.
  const keys = new Set<string>([...meteredKeys(), ...byKey.keys()]);
  const rows: ConnectorSpendRowView[] = [...keys]
    .map((key) => {
      const row = byKey.get(key);
      return {
        key,
        label: CONNECTOR_LABEL(key),
        costCents: row?.costCents ?? 0,
        costLabel: formatCents(row?.costCents ?? 0),
        units: row?.units ?? 0,
        count: row?.count ?? 0,
        disclosure: describeConnectorCost(key),
      };
    })
    .sort((a, b) => b.costCents - a.costCents || a.label.localeCompare(b.label));

  return {
    isDemo,
    configured,
    capCents: summary.capCents,
    capDollars: Math.round(summary.capCents / 100),
    capLabel: formatCents(summary.capCents),
    spentLabel: formatCents(summary.totalCostCents),
    remainingLabel: formatCents(summary.remainingCents),
    pctOfCap: summary.pctOfCap,
    isNearCap: summary.isNearCap,
    isOverCap: summary.isOverCap,
    periodLabel: "This month",
    rows,
  };
}

type UsageRow = { connector_key: string; units: number | null; cost_estimate_cents: number | null; occurred_at: string };

/** Load this period's metered usage events for a workspace (admin client, scoped). */
async function loadPeriodEvents(client: SupabaseClient, workspaceId: string): Promise<ConnectorUsageEvent[]> {
  const { data, error } = await client
    .from("connector_usage_events")
    .select("connector_key,units,cost_estimate_cents,occurred_at")
    .eq("workspace_id", workspaceId)
    .gte("occurred_at", periodStartIso())
    .order("occurred_at", { ascending: false });
  if (error || !data) return [];
  return (data as UsageRow[]).map((r) => ({
    connectorKey: r.connector_key,
    units: r.units ?? 0,
    costCents: r.cost_estimate_cents ?? 0,
    occurredAt: r.occurred_at,
  }));
}

// ---- demo fallback (offline preview): a believable BSR month ----
function demoView(): ConnectorSpendView {
  const now = new Date().toISOString();
  const events: ConnectorUsageEvent[] = [
    { connectorKey: "permit-data", units: 120, costCents: 960, occurredAt: now },
    { connectorKey: "permit-data", units: 45, costCents: 360, occurredAt: now },
  ];
  return toConnectorSpendView(events, DEFAULT_SPEND_CAP_CENTS, true, true);
}

const ZERO_VIEW = (): ConnectorSpendView => toConnectorSpendView([], DEFAULT_SPEND_CAP_CENTS, false, false);

/** The Settings → Usage connector-spend view for the active workspace. */
export async function getConnectorSpendView(): Promise<ConnectorSpendView> {
  if (isSupabaseAdminConfigured()) {
    try {
      const ctx = await getCurrentWorkspaceContext();
      if (ctx.workspaceId) {
        const client = getSupabaseAdminClient() as unknown as SupabaseClient;
        const [events, capCents] = await Promise.all([
          loadPeriodEvents(client, ctx.workspaceId),
          getSpendCapCents(client, ctx.workspaceId),
        ]);
        return toConnectorSpendView(events, capCents, false, true);
      }
    } catch {
      // fall through to demo/zeros
    }
  }
  if (isDemoDataEnabled()) return demoView();
  return ZERO_VIEW();
}
