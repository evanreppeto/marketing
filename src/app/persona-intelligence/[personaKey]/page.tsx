import Link from "next/link";
import { connection } from "next/server";

import { IntelligencePanel } from "@/app/_components/intelligence-panel";
import { EmptyState, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { DetailStack, WorkspacePanel } from "@/app/_components/workspace";
import { getPersonaCtaRule, personaSlug } from "@/lib/persona-intelligence/cta-rules";
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";

type PersonaDetailPageProps = {
  params: Promise<{ personaKey: string }>;
};

export default async function PersonaDetailPage({ params }: PersonaDetailPageProps) {
  await connection();

  const { personaKey } = await params;
  const rule = getPersonaCtaRule(personaKey);
  const data = await getPersonaIntelligenceData();
  const livePersona = data.status === "live" && rule ? data.personas.find((persona) => persona.key === personaSlug(rule.persona)) ?? null : null;

  if (!rule) {
    return (
      <>
        <Header title="Persona not found" subtitle="This persona is not part of the official Growth Engine routing taxonomy." />
        <EmptyState title="Unknown persona" detail="Use one of the official persona routes from Persona Intelligence." />
      </>
    );
  }

  return (
    <>
      <Header title={rule.label} subtitle={rule.messageAngle} />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-5">
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

          <WorkspacePanel
            eyebrow="Live memory"
            title="Current persona snapshot"
            description="Loaded from Supabase persona memory when available. Empty states are intentional."
          >
            {livePersona?.snapshot ? (
              <DetailStack
                items={[
                  { label: "Confidence", value: livePersona.snapshot.confidence },
                  { label: "Relationship stage", value: livePersona.snapshot.relationshipStage },
                  { label: "Value tier", value: livePersona.snapshot.valueTier },
                  { label: "Loss pattern", value: livePersona.snapshot.dominantLossPattern },
                  { label: "Preferred channel", value: livePersona.snapshot.preferredChannel },
                  { label: "Recommended offer", value: livePersona.snapshot.recommendedOffer },
                  { label: "Next action", value: livePersona.snapshot.nextBestAction },
                  { label: "Risk flags", value: livePersona.snapshot.riskFlags.join(", ") },
                ]}
              />
            ) : (
              <EmptyState title="No current snapshot" detail="Mark can create persona snapshots from real leads, companies, campaigns, and approval records once enough evidence exists." />
            )}
          </WorkspacePanel>

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

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="module-rise mb-5 rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-6 py-5 shadow-[var(--elev-panel)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="signal-eyebrow">Persona Intelligence</span>
        <StatusPill tone="amber">Internal only</StatusPill>
        <StatusPill tone="amber">No publishing</StatusPill>
      </div>
      <h1 className="mt-3 max-w-3xl text-[clamp(1.8rem,3vw,3.2rem)] font-black leading-[0.98] tracking-[-0.05em] text-[var(--text-primary)]">
        {title}
      </h1>
      <p className="mt-3 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">{subtitle}</p>
    </header>
  );
}
