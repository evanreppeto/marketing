import Link from "next/link";
import { connection } from "next/server";

import { IntelligencePanel } from "@/app/_components/intelligence-panel";
import { EmptyState, PageHeader, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { DetailStack, WorkspacePanel } from "@/app/_components/workspace";
import { getPersonaCtaRule, personaSlug } from "@/lib/persona-intelligence/cta-rules";
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";
import { getAgentName } from "@/lib/settings/agent-name";

type PersonaDetailPageProps = {
  params: Promise<{ personaKey: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
};

type PersonaDetailTab = "rule" | "memory" | "arc-use" | "performance";

const PERSONA_DETAIL_TAB_KEYS: PersonaDetailTab[] = ["rule", "memory", "arc-use", "performance"];

function buildPersonaDetailTabs(agentName: string): Array<{ key: PersonaDetailTab; label: string; detail: string }> {
  return [
    { key: "rule", label: "Rulebook", detail: "Approved CTA and landing guidance" },
    { key: "memory", label: "Live snapshot", detail: "Supabase persona memory if available" },
    { key: "arc-use", label: `How ${agentName} uses it`, detail: "How the agent applies it" },
    { key: "performance", label: "Performance", detail: "Coming soon" },
  ];
}

export default async function PersonaDetailPage({ params, searchParams }: PersonaDetailPageProps) {
  await connection();

  const { personaKey } = await params;
  const query = searchParams ? await searchParams : {};
  const activeTab = normalizePersonaDetailTab(query.tab);
  const rule = getPersonaCtaRule(personaKey);
  const [data, agentName] = await Promise.all([getPersonaIntelligenceData(), getAgentName()]);
  const livePersona = data.status === "live" && rule ? data.personas.find((persona) => persona.key === personaSlug(rule.persona)) ?? null : null;

  if (!rule) {
    return (
      <>
        <Header title="Persona not found" subtitle="This persona is not part of the official Arc routing taxonomy." />
        <EmptyState title="Unknown persona" detail="Use one of the official persona routes from Persona Intelligence." />
      </>
    );
  }

  return (
    <>
      <Header title={rule.label} subtitle={rule.messageAngle} />

      <PersonaDetailTabs activeTab={activeTab} personaKey={personaKey} agentName={agentName} />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0">
          {activeTab === "rule" ? (
            <WorkspacePanel
              eyebrow="Internal CTA rule"
              title="Landing guidance"
              description="Planning guidance for campaign briefs and approval cards. This app does not publish persona landing pages."
            >
              <DetailStack
                items={[
                  { label: "Persona tag", value: rule.persona },
                  { label: "Segment", value: rule.segment },
                  { label: "Primary CTA", value: rule.primaryCta },
                  { label: "Secondary CTA", value: rule.secondaryCta },
                  { label: "Landing rule", value: rule.landingRule },
                  { label: "Guardrail", value: rule.guardrail },
                ]}
              />
            </WorkspacePanel>
          ) : null}

          {activeTab === "memory" ? (
            <WorkspacePanel
              eyebrow="Live memory"
              title="Current persona snapshot"
              description="Loaded from Supabase persona memory when available. Empty states are intentional."
            >
              {livePersona?.snapshot ? (
                <DetailStack
                  items={[
                    { label: "Confidence", value: livePersona.snapshot.confidence },
                    { label: "Relationship stage", value: humanizePersonaValue(livePersona.snapshot.relationshipStage) },
                    { label: "Value tier", value: humanizePersonaValue(livePersona.snapshot.valueTier) },
                    { label: "Loss pattern", value: humanizePersonaValue(livePersona.snapshot.dominantLossPattern) },
                    { label: "Preferred channel", value: humanizePersonaValue(livePersona.snapshot.preferredChannel) },
                    { label: "Recommended offer", value: livePersona.snapshot.recommendedOffer },
                    { label: "Next action", value: livePersona.snapshot.nextBestAction },
                    { label: "Risk flags", value: livePersona.snapshot.riskFlags.map(humanizePersonaValue).join(", ") },
                  ]}
                />
              ) : (
                <EmptyState title="No current snapshot" detail={`${agentName} can create persona snapshots from real leads, companies, campaigns, and approval records once enough evidence exists.`} />
              )}
            </WorkspacePanel>
          ) : null}

          {activeTab === "arc-use" ? (
            <WorkspacePanel eyebrow={`${agentName} use`} title={`How ${agentName} should use this`}>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {[
                  ["Campaign briefs", "Use the CTA and message angle when drafting reviewable campaign packages."],
                  ["Approval cards", "Show persona, CTA, evidence, risk flags, and recommended human decision."],
                  ["CRM enrichment", "Attach source evidence and missing fields before campaign preparation."],
                  ["Guardrails", "Flag risky insurance, claim, timeline, or unsupported scope language."],
                ].map(([title, detail]) => (
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4" key={title}>
                    <div className="font-bold text-[var(--text-primary)]">{title}</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
                  </div>
                ))}
              </div>
            </WorkspacePanel>
          ) : null}

          {activeTab === "performance" ? (
            <WorkspacePanel
              eyebrow="Performance"
              title="Persona performance is coming soon"
              description="Conversion, pipeline, and what's working per persona will appear here once the persona-to-outcome join is wired."
            >
              <EmptyState
                title="Not yet wired"
                detail="This tab will show real campaign and outcome data attributed to this persona. It is intentionally empty until that data is connected — no placeholder numbers."
              />
            </WorkspacePanel>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: rule.label,
              persona: rule.persona,
              confidence: livePersona?.snapshot?.confidence ?? "Rule defined",
              journeyStage: livePersona?.stage ?? "Internal planning",
              urgency: rule.segment === "Homeowner" && rule.persona.includes("emergency") ? "Emergency intake" : "Review",
              attentionReason: livePersona?.intent ?? rule.messageAngle,
              nextBestAction: livePersona?.snapshot?.nextBestAction ?? `Use ${rule.primaryCta} as the primary internal CTA rule.`,
              cta: `${rule.primaryCta} / ${rule.secondaryCta}`,
              messageAngle: livePersona?.snapshot?.messagePosture ?? rule.messageAngle,
              guardrailStatus: rule.guardrail,
              scores: [
                { label: "Segment", value: rule.segment, detail: "Persona routing" },
                { label: "Live score", value: livePersona?.score ?? "Missing", detail: "Persona memory confidence", tone: livePersona ? livePersona.tone : "gray" },
                { label: "Publishing", value: "Locked", detail: "Internal only", tone: "amber" },
              ],
              proofPoints: [rule.landingRule, rule.guardrail],
              outboundLocked: true,
            }}
            agentName={agentName}
          />

          <div className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4">
            <div className="signal-eyebrow">Actions</div>
            <div className="mt-4 flex flex-col gap-2">
              <Link href={`/brain?persona=${personaSlug(rule.persona)}`} className={buttonClasses({ variant: "ghost" })}>
                Open in Brain
              </Link>
              <Link href="/personas" className={buttonClasses({ variant: "ghost" })}>
                Back to personas
              </Link>
              {livePersona ? (
                <Link href={livePersona.crmPath} className={buttonClasses({ variant: "ghost" })}>
                  Open related CRM
                </Link>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function PersonaDetailTabs({ activeTab, personaKey, agentName }: { activeTab: PersonaDetailTab; personaKey: string; agentName: string }) {
  return (
    <nav aria-label="Persona detail sections" className="module-rise mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border-hairline)] pb-3">
      {buildPersonaDetailTabs(agentName).map((tab) => {
        const selected = activeTab === tab.key;
        const href = tab.key === "rule" ? `/personas/${personaKey}` : `/personas/${personaKey}?tab=${tab.key}`;

        return (
          <Link
            aria-current={selected ? "page" : undefined}
            className={`relative min-w-[13rem] cursor-pointer rounded px-3 py-2.5 transition duration-150 active:translate-y-px ${
              selected
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
            href={href}
            key={tab.key}
          >
            <span className="block text-sm font-bold text-[var(--text-primary)]">{tab.label}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tab.detail}</span>
            {selected ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-px rounded-full bg-[var(--accent)]" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <PageHeader
      eyebrow="Persona intelligence"
      title={title}
      description={subtitle}
      aside={
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="amber">Internal only</StatusPill>
          <StatusPill tone="amber">No publishing</StatusPill>
        </div>
      }
    />
  );
}

function normalizePersonaDetailTab(value: string | string[] | undefined): PersonaDetailTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return PERSONA_DETAIL_TAB_KEYS.some((key) => key === tab) ? (tab as PersonaDetailTab) : "rule";
}

function humanizePersonaValue(value: string) {
  return value
    .replace(/^persona_/, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
