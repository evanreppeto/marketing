"use client";

// ---------------------------------------------------------------------------
// Settings → Connections marketplace catalog (BSR-371). Renders whatever is in
// CONNECTOR_REGISTRY (via ConnectorView) — nothing is hardcoded here:
//   • a "Recommended for your business" rail, filtered by the workspace industry
//     matched against each connector's `verticals`;
//   • the full catalog grouped by kind (Signal sources / Channels / Tools),
//     each card carrying a cost-tier badge;
//   • an honest "Coming soon" state for registered-but-unbuilt connectors, so
//     the catalog looks full without faking a connect.
// The display maps (logo, cost badge, kind + status labels) live here and are
// re-imported by settings-view.tsx's connector detail page, so the two can't
// drift.
// ---------------------------------------------------------------------------

import {
  CONNECTOR_KIND_ORDER,
  CONNECTOR_KIND_SECTION,
  connectorRecommendedForVerticals,
  verticalsForIndustry,
  type ConnectorCostTier,
  type ConnectorStatus,
} from "@/domain";
import type { ConnectorView } from "@/lib/connectors/read-model";

// Per-connector logo (mark + color) and, for credentialed connectors, the label
// + hint shown on the connect form. Coming-soon connectors carry a mark only.
export const CONNECTOR_META: Record<string, { c: string; l: string; credLabel: string; credHint: string }> = {
  "gemini-research": {
    c: "#88b6d8",
    l: "Gem",
    credLabel: "Gemini API key",
    credHint: "From Google AI Studio. Stored encrypted in your Vault — never shown again, never sent to the browser.",
  },
  higgsfield: {
    c: "#c8a24a",
    l: "Hf",
    credLabel: "Higgsfield API token",
    credHint: "From your Higgsfield account. Stored in your Vault; the runner uses it only for approval-gated draft assets.",
  },
  "weather-signals": {
    c: "#7fb89a",
    l: "Wx",
    credLabel: "",
    credHint: "No credential — reads live NWS/NOAA alerts (public API) and proposes storm-response opportunities. Configure the states to watch.",
  },
  "webhook-dispatch": {
    c: "#9aa0ac",
    l: "Wh",
    credLabel: "",
    credHint: "No credential — the endpoint URL lives in config. Sends only from the human-approved path.",
  },
  "reviews-signals": {
    c: "#e0a94a",
    l: "Rv",
    credLabel: "Google Business Profile",
    credHint:
      "Connect your Google Business Profile (and optionally Yelp) to pull recent reviews. Stored in your Vault; used read-only — it proposes opportunities and never replies.",
  },
  "permit-signals": { c: "#d8b65e", l: "Pm", credLabel: "", credHint: "" },
  "listing-signals": { c: "#88b6d8", l: "Ls", credLabel: "", credHint: "" },
  "store-signals": { c: "#c47055", l: "St", credLabel: "Store API key", credHint: "" },
  "sms-dispatch": { c: "#9678c8", l: "Sm", credLabel: "", credHint: "" },
  "meta-ads": { c: "#5b8def", l: "Ma", credLabel: "Meta Business login", credHint: "" },
  "crm-enrichment": { c: "#19c4cc", l: "En", credLabel: "Enrichment API key", credHint: "" },
};

// costTier badge — HYBRID cost model (BSR-372 meters later; here we just label it).
export const COST_TIER_BADGE: Record<ConnectorCostTier, { label: string; title: string }> = {
  free: { label: "Free", title: "No cost — bypasses metering." },
  byo_key: { label: "Your key", title: "Uses your own provider key/credits — you pay the provider directly." },
  metered: { label: "Metered", title: "Billed through your Arc usage (caps governed by BSR-372)." },
};

export const CONNECTOR_KIND_LABEL: Record<string, string> = {
  mcp_tool: "Tool",
  signal_source: "Signal source",
  channel: "Channel",
};

export const CONNECTOR_STATUS_PILL: Record<ConnectorStatus, { kind: string; label: string }> = {
  connected: { kind: "ok", label: "Connected" },
  not_configured: { kind: "off", label: "Not connected" },
  disabled: { kind: "warn", label: "Paused" },
  error: { kind: "err", label: "Error" },
};

function logoFor(view: ConnectorView) {
  return CONNECTOR_META[view.key] ?? { c: "#9aa0ac", l: view.label.slice(0, 2), credLabel: "API key", credHint: "" };
}

// One catalog card. Available connectors drill into the detail page; coming-soon
// connectors render dimmed and non-interactive with a "Coming soon" pill — there
// is deliberately no way to fake-enable them.
function CatalogCard({ view, onOpen }: { view: ConnectorView; onOpen?: (key: string) => void }) {
  const meta = logoFor(view);
  const cost = COST_TIER_BADGE[view.costTier];
  const kindLabel = CONNECTOR_KIND_LABEL[view.kind] ?? view.kind;
  const soon = !view.available;
  const pill = CONNECTOR_STATUS_PILL[view.status];
  const cta = view.credentialPresent || view.enabled ? "Manage" : view.credentialOptional ? "Set up" : "Connect";
  const interactive = !soon && Boolean(onOpen);

  return (
    <div
      className={`ccard${interactive ? " ccard-btn" : ""}${soon ? " ccard-soon" : ""}`}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            onClick: () => onOpen?.(view.key),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.(view.key);
              }
            },
          }
        : {})}
    >
      <div className="ct">
        <span className="clogo" style={{ background: `${meta.c}22`, border: `1px solid ${meta.c}55`, color: meta.c }}>
          {meta.l}
        </span>
        <div>
          <div className="cnm">{view.label}</div>
          <div className="ccat">
            {kindLabel} · {view.access === "read_only" ? "read-only" : "gated write"}
          </div>
        </div>
      </div>
      <div className="cdsc">{view.description}</div>
      <div className="cfoot">
        {soon ? (
          <span className="spill off">
            <span className="pd" />
            Coming soon
          </span>
        ) : (
          <span className={`spill ${pill.kind}`}>
            <span className="pd" />
            {pill.label}
          </span>
        )}
        <span className="badge" title={cost.title}>
          {cost.label}
        </span>
        <span className="grow" />
        {interactive ? <span className="cb-open">{cta} →</span> : null}
      </div>
    </div>
  );
}

/**
 * The marketplace catalog. Groups the registered connectors by kind and surfaces
 * a "Recommended for your business" rail driven by `industry` → verticals. The
 * rail changes as the industry changes; when no industry (or no vertical match)
 * is set it becomes a prompt to pick one — the connectors still show in their
 * kind sections below, so nothing is hidden.
 */
export function ConnectorCatalog({
  connectors,
  industry,
  onOpen,
  onEditIndustry,
}: {
  connectors: ConnectorView[];
  industry: string;
  onOpen: (key: string) => void;
  onEditIndustry: () => void;
}) {
  const verticals = verticalsForIndustry(industry);
  const rail = connectors
    .filter((v) => connectorRecommendedForVerticals(v, verticals))
    // Live picks first, coming-soon after — the rail leads with what's actionable.
    .sort((a, b) => Number(b.available) - Number(a.available));
  const industryLabel = industry.trim();

  return (
    <div className="catalog">
      {rail.length ? (
        <section className="catsec catsec-rec">
          <div className="catsec-h">
            <h3>Recommended for your business</h3>
            <span className="catsec-sub">
              Matched to <b>{industryLabel}</b> — change it in{" "}
              <button type="button" className="catlink" onClick={onEditIndustry}>
                General
              </button>{" "}
              to retune.
            </span>
          </div>
          <div className="conngrid">
            {rail.map((v) => (
              <CatalogCard key={`rec-${v.key}`} view={v} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ) : (
        <div className="cnote catnote-rec">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4l3 2" />
          </svg>
          <div>
            Set your <b>industry</b> in{" "}
            <button type="button" className="catlink" onClick={onEditIndustry}>
              General
            </button>{" "}
            and Arc will recommend the connectors that fit your business type.
          </div>
        </div>
      )}

      {CONNECTOR_KIND_ORDER.map((kind) => {
        const items = connectors.filter((v) => v.kind === kind);
        if (!items.length) return null;
        const section = CONNECTOR_KIND_SECTION[kind];
        return (
          <section className="catsec" key={kind}>
            <div className="catsec-h">
              <h3>{section.title}</h3>
              <span className="catsec-sub">{section.blurb}</span>
            </div>
            <div className="conngrid">
              {items.map((v) => (
                <CatalogCard key={v.key} view={v} onOpen={onOpen} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
