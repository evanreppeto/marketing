import Link from "next/link";
import { connection } from "next/server";

import { IntelligencePanel } from "../_components/intelligence-panel";
import { EmptyState, StatusPill, buttonClasses } from "../_components/page-header";
import { MetricStrip, WorkspacePanel } from "../_components/workspace";
import { getPersonaIntelligenceData, type PersonaTrackerRow } from "@/lib/persona-intelligence/read-model";
import { PERSONA_CTA_RULES, personaSlug, type PersonaCtaRule } from "@/lib/persona-intelligence/cta-rules";

export default async function PersonaIntelligencePage() {
  await connection();

  const data = await getPersonaIntelligenceData();
  const livePersonas = data.status === "live" ? data.personas : [];
  const liveBySlug = new Map(livePersonas.map((persona) => [persona.key, persona]));
  const rows = PERSONA_CTA_RULES.map((rule) => ({ rule, live: liveBySlug.get(personaSlug(rule.persona)) ?? null }));
  const topLive = livePersonas[0] ?? null;

  return (
    <>
      <header className="module-rise mb-5 rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-6 py-5 shadow-[var(--elev-panel)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="signal-eyebrow">Persona Intelligence</span>
          <StatusPill tone={data.status === "live" ? "green" : "amber"}>{data.status === "live" ? "Live memory" : "Unavailable"}</StatusPill>
          <StatusPill tone="amber">Internal CTA rules</StatusPill>
          <StatusPill tone="amber">No publishing</StatusPill>
        </div>
        <h1 className="mt-3 max-w-3xl text-[clamp(1.8rem,3vw,3.2rem)] font-black leading-[0.98] tracking-[-0.05em] text-[var(--text-primary)]">
          Persona rules Mark can use, humans can approve.
        </h1>
        <p className="mt-3 max-w-[76ch] text-sm leading-6 text-[var(--text-secondary)]">
          This page keeps BSR persona CTAs, message angles, landing guidance, and guardrails in one internal view. It does not publish landing pages or trigger outreach.
        </p>
      </header>

      {data.status === "unavailable" ? (
        <div className="module-rise mb-5 rounded-lg border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Persona memory unavailable: </span>
          {data.message}
        </div>
      ) : null}

      <MetricStrip
        metrics={[
          { label: "Official personas", value: PERSONA_CTA_RULES.length, detail: "Approved routing tags", tone: "blue" },
          { label: "Live snapshots", value: livePersonas.length, detail: "Current persona memory", tone: livePersonas.length > 0 ? "green" : "gray" },
          {
            label: "Partner rules",
            value: PERSONA_CTA_RULES.filter((rule) => rule.segment === "Partner").length,
            detail: "Trade and referral handoff",
            tone: "blue",
          },
          {
            label: "Content signals",
            value: data.status === "live" ? data.contentSignals.length : 0,
            detail: "Knowledge entries ready for Mark",
            tone: data.status === "live" && data.contentSignals.length > 0 ? "green" : "gray",
          },
        ]}
      />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            eyebrow="Internal landing rules"
            title="CTA matrix"
            description="These are planning rules for approval cards and campaign briefs. They are not published pages."
          >
            <div className="grid gap-3 p-4 xl:grid-cols-2">
              {rows.map(({ rule, live }) => (
                <PersonaRuleCard key={rule.persona} rule={rule} live={live} />
              ))}
            </div>
          </WorkspacePanel>

          <div className="grid gap-5 xl:grid-cols-2">
            <SignalPanel
              eyebrow="Knowledge feed"
              title="Content signals"
              rows={data.status === "live" ? data.contentSignals : []}
              empty="No active persona knowledge entries are available yet."
            />
            <SignalPanel
              eyebrow="Guardrails"
              title="Copy checks"
              rows={data.status === "live" ? data.guardrailSignals : []}
              empty="No active guardrail rules are available yet."
            />
          </div>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: topLive?.persona ?? "Persona operating rules",
              persona: topLive?.persona ?? "All personas",
              confidence: topLive?.snapshot?.confidence ?? (data.status === "live" ? "Rules defined" : "Missing live memory"),
              journeyStage: topLive?.stage ?? "Internal planning",
              urgency: "Human approval required",
              attentionReason: topLive?.intent ?? "Mark should use persona rules to prepare reviewable work, not to publish or contact anyone.",
              nextBestAction: topLive?.nextAction ?? "Use persona CTA rules when generating campaign briefs and approval cards.",
              cta: topLive?.offer ?? "Call Now / Upload Photos, Request Vendor Packet, Refer a Client, or Become a Partner.",
              messageAngle: topLive?.snapshot?.messagePosture ?? "Restoration, mitigation, documentation, rebuild, and partner handoff.",
              guardrailStatus: "Persona rules are internal only. No page publishing, sending, launch, spend, or contact action is enabled.",
              scores: [
                { label: "Personas", value: PERSONA_CTA_RULES.length, detail: "Official tags", tone: "blue" },
                { label: "Snapshots", value: livePersonas.length, detail: "Live memory rows", tone: livePersonas.length > 0 ? "green" : "gray" },
                { label: "Publishing", value: "Locked", detail: "Internal planning only", tone: "amber" },
              ],
              proofPoints: [
                "Emergency homeowner: Call Now / Upload Photos.",
                "Property manager: Request Vendor Packet.",
                "Insurance agent: Refer a Client.",
                "Trade partner: Become a Partner.",
              ],
              outboundLocked: true,
            }}
          />
        </aside>
      </div>
    </>
  );
}

function PersonaRuleCard({ rule, live }: { rule: PersonaCtaRule; live: PersonaTrackerRow | null }) {
  return (
    <article className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={live ? live.tone : "gray"}>{rule.segment}</StatusPill>
        <StatusPill tone="amber">No publish</StatusPill>
      </div>
      <h2 className="mt-3 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{rule.label}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{rule.messageAngle}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <RuleField label="Primary CTA" value={rule.primaryCta} />
        <RuleField label="Secondary CTA" value={rule.secondaryCta} />
      </div>

      <div className="mt-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Landing rule</div>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{rule.landingRule}</p>
      </div>

      <div className="mt-3 rounded-lg border border-[oklch(0.82_0.13_85/0.32)] bg-[oklch(0.82_0.13_85/0.08)] px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.9_0.09_85)]">Guardrail</div>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{rule.guardrail}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/persona-intelligence/${personaSlug(rule.persona)}`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          Open details
        </Link>
        {live ? (
          <Link href={live.crmPath} className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Related CRM
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function RuleField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-sm font-bold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function SignalPanel({
  eyebrow,
  title,
  rows,
  empty,
}: {
  eyebrow: string;
  title: string;
  rows: Array<{ signal: string; source: string; engineUse: string; priority: string }>;
  empty: string;
}) {
  return (
    <WorkspacePanel eyebrow={eyebrow} title={title}>
      {rows.length > 0 ? (
        <div className="divide-y divide-[var(--border-hairline)]">
          {rows.map((row) => (
            <div className="px-5 py-4" key={`${row.source}-${row.signal}`}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-bold text-[var(--text-primary)]">{row.signal}</div>
                <StatusPill tone={row.priority.toLowerCase().includes("high") ? "amber" : "blue"}>{row.priority}</StatusPill>
              </div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{row.source}</div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{row.engineUse}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No live signal yet" detail={empty} />
      )}
    </WorkspacePanel>
  );
}
