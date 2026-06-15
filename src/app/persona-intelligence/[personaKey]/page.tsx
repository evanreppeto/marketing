import Link from "next/link";
import { connection } from "next/server";

import { IntelligencePanel } from "@/app/_components/intelligence-panel";
import { EmptyState, PageHeader, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { DetailStack, WorkspacePanel } from "@/app/_components/workspace";
import { getPersonaCtaRule, personaSlug } from "@/lib/persona-intelligence/cta-rules";
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";

type PersonaDetailPageProps = {
  params: Promise<{ personaKey: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
};

type PersonaDetailTab = "rule" | "memory" | "mark-use";

const personaDetailTabs: Array<{ key: PersonaDetailTab; label: string; detail: string }> = [
  { key: "rule", label: "CTA rule", detail: "Approved internal language" },
  { key: "memory", label: "Live memory", detail: "Supabase snapshot if available" },
  { key: "mark-use", label: "Mark use", detail: "How the agent applies it" },
];

export default async function PersonaDetailPage({ params, searchParams }: PersonaDetailPageProps) {
  await connection();

  const { personaKey } = await params;
  const query = searchParams ? await searchParams : {};
  const activeTab = normalizePersonaDetailTab(query.tab);
  const rule = getPersonaCtaRule(personaKey);
  const data = await getPersonaIntelligenceData();
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

      <PersonaDetailTabs activeTab={activeTab} personaKey={personaKey} />

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
                <EmptyState title="No current snapshot" detail="Mark can create persona snapshots from real leads, companies, campaigns, and approval records once enough evidence exists." />
              )}
            </WorkspacePanel>
          ) : null}

          {activeTab === "mark-use" ? (
            <WorkspacePanel eyebrow="Mark use" title="How Mark should use this">
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
          />

          <div className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4">
            <div className="signal-eyebrow">Actions</div>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/persona-intelligence" className={buttonClasses({ variant: "ghost" })}>
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

function PersonaDetailTabs({ activeTab, personaKey }: { activeTab: PersonaDetailTab; personaKey: string }) {
  return (
    <nav aria-label="Persona detail sections" className="module-rise mb-5 grid gap-2 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2 shadow-[var(--elev-panel)] md:grid-cols-3">
      {personaDetailTabs.map((tab) => {
        const selected = activeTab === tab.key;
        const href = tab.key === "rule" ? `/persona-intelligence/${personaKey}` : `/persona-intelligence/${personaKey}?tab=${tab.key}`;

        return (
          <Link
            aria-current={selected ? "page" : undefined}
            className={`cursor-pointer rounded-lg border px-4 py-3 transition duration-200 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] active:translate-y-px ${
              selected
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)]"
            }`}
            href={href}
            key={tab.key}
          >
            <span className="block text-sm font-bold text-[var(--text-primary)]">{tab.label}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tab.detail}</span>
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
  return personaDetailTabs.some((item) => item.key === tab) ? (tab as PersonaDetailTab) : "rule";
}

function humanizePersonaValue(value: string) {
  return value
    .replace(/^persona_/, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
