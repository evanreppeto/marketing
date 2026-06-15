import Link from "next/link";

import { IntelligencePanel, type IntelligencePanelModel } from "@/app/_components/intelligence-panel";
import { Button, EmptyState, StatusPill, buttonClasses } from "@/app/_components/page-header";
import {
  type ApprovalCard,
  type ApprovalLeadCandidate,
  type ApprovalStructuredSection,
} from "@/lib/approvals/read-model";

import { decideApprovalItemAction } from "./actions";

export function ApprovalDetailPanel({
  item,
  requestedItemId,
  agentName = "Arc",
}: {
  item: ApprovalCard | null;
  requestedItemId?: string | null;
  agentName?: string;
}) {
  if (!item) {
    return (
      <aside className="2xl:sticky 2xl:top-5 2xl:self-start">
        <EmptyState
          title={requestedItemId ? "Approval packet not found" : "Choose an approval packet"}
          detail={
            requestedItemId
              ? "That item is no longer in the active queue. It may have already been approved, declined, revised, or archived."
              : "Open any review card to inspect the draft, evidence, risks, related records, and available human decisions."
          }
        />
      </aside>
    );
  }

  const relatedRecords = [
    { label: "Company", value: item.relatedRecords.company },
    { label: "Contact", value: item.relatedRecords.contact },
    { label: "Lead", value: item.relatedRecords.lead },
  ].filter((record) => record.value);

  return (
    <aside className="2xl:sticky 2xl:top-5 2xl:self-start">
      <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="signal-eyebrow">Approval packet</span>
            <StatusPill tone={riskTone(item.riskLevel)}>{item.riskLevel}</StatusPill>
            <StatusPill tone="amber">Outbound locked</StatusPill>
          </div>
          <h2 className="mt-3 text-2xl font-bold leading-tight tracking-[-0.03em] text-[var(--text-primary)]">
            {item.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.previewText}</p>
        </div>

        <div className="space-y-4 p-5">
          <IntelligencePanel model={buildApprovalIntelligence(item, relatedRecords.length)} agentName={agentName} />
          <DecisionForms item={item} agentName={agentName} />

          <PacketSection title={`What ${agentName} created`}>
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
              <CompactField label="Type" value={item.type} />
              <CompactField label="Channel" value={item.channel} />
              <CompactField label="Persona" value={item.persona} />
              <CompactField label="Created by" value={item.sourceAgent} />
            </div>
          </PacketSection>

          <PacketSection title="Recommended human action">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">{item.recommendedAction}</p>
          </PacketSection>

          <PacketSection title="Campaign context">
            <CompactField label={item.campaign.name} value={item.campaign.objective} />
            {item.campaign.id ? (
              <Link className={buttonClasses({ variant: "ghost", size: "sm", className: "mt-3 w-full" })} href={`/campaigns/${item.campaign.id}`}>
                Open campaign package
              </Link>
            ) : null}
          </PacketSection>

          {relatedRecords.length > 0 ? (
            <PacketSection title="Related records">
              <div className="space-y-2">
                {relatedRecords.map((record) => (
                  <CompactField key={record.label} label={record.label} value={`${record.value?.label} - ${record.value?.detail}`} />
                ))}
              </div>
            </PacketSection>
          ) : null}

          <DraftPreview item={item} />

          <FlagList title="Guardrail notes" items={item.complianceFlags} tone="blue" empty="No compliance notes were captured." />
          <FlagList title="Risk flags" items={item.riskFlags} tone="amber" empty="No risk flags were captured." />
          <EvidenceList urls={item.evidence} />
          <CreativeAssetList item={item} />

          <details className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Debug inputs
            </summary>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
              {item.promptInput}
            </pre>
          </details>
        </div>
      </section>
    </aside>
  );
}

function buildApprovalIntelligence(item: ApprovalCard, relatedRecordCount: number): IntelligencePanelModel {
  const candidateScores =
    item.structuredDraft?.kind === "partner_lead_list"
      ? item.structuredDraft.candidates
          .map((candidate) => candidate.partnerScore)
          .filter((score): score is number => typeof score === "number")
      : [];
  const averagePartnerScore =
    candidateScores.length > 0
      ? Math.round(candidateScores.reduce((total, score) => total + score, 0) / candidateScores.length)
      : null;
  const confidence = deriveApprovalConfidence(item);
  const proofPoints = [
    ...item.complianceFlags.map((flag) => `Guardrail: ${flag}`),
    ...item.riskFlags.map((flag) => `Risk: ${flag}`),
  ];

  return {
    title: "Approval decision context",
    persona: item.persona,
    confidence,
    journeyStage: "Human approval review",
    urgency: item.riskLevel ? `${humanize(item.riskLevel)} risk` : item.statusLabel,
    attentionReason: item.previewText || item.campaign.objective,
    nextBestAction: item.recommendedAction,
    cta: approvalCtaRule(item),
    messageAngle: item.campaign.objective || `${item.type} for ${item.channel}`,
    guardrailStatus: item.complianceFlags.length > 0
      ? item.complianceFlags.join(", ")
      : "Human approval required before any outbound step.",
    scores: [
      {
        label: "Evidence",
        value: item.evidence.length,
        detail: "Source links captured",
        tone: item.evidence.length > 0 ? "blue" : "gray",
      },
      {
        label: "Related",
        value: relatedRecordCount,
        detail: "CRM records linked",
        tone: relatedRecordCount > 0 ? "blue" : "gray",
      },
      {
        label: "Partner",
        value: averagePartnerScore,
        detail: candidateScores.length > 0 ? "Average candidate score" : "No partner score",
        tone: averagePartnerScore === null ? "gray" : averagePartnerScore >= 80 ? "green" : "amber",
      },
    ],
    proofPoints: proofPoints.length > 0 ? proofPoints.slice(0, 8) : ["Approval gate is active. Outbound remains locked."],
    evidence: item.evidence.slice(0, 6).map((url, index) => ({
      label: `Evidence ${index + 1}`,
      href: url,
      detail: url,
    })),
    outboundLocked: true,
  };
}

function deriveApprovalConfidence(item: ApprovalCard) {
  if (item.structuredDraft?.kind === "partner_lead_list") {
    const confidences = item.structuredDraft.candidates.map((candidate) => candidate.confidence).filter(Boolean);
    if (confidences.length > 0) return confidences[0] ?? "Candidate confidence captured";
  }

  if (item.evidence.length > 0 && item.complianceFlags.length > 0) {
    return "Evidence and guardrails captured";
  }

  if (item.evidence.length > 0) {
    return "Evidence linked";
  }

  return "Needs source evidence";
}

function approvalCtaRule(item: ApprovalCard) {
  const persona = item.persona.toLowerCase();
  if (/property/.test(persona)) return "Property managers: Request Vendor Packet. Approval required before use.";
  if (/insurance/.test(persona)) return "Insurance agents: Refer a Client. Keep wording coverage-neutral.";
  if (/plumb|sewer|hvac|roof|electric|gc|remodel|partner|trade/.test(persona)) return "Trade partners: Become a Partner. No outreach without approval.";
  if (/homeowner|emergency/.test(persona)) return "Emergency homeowners: Call Now / Upload Photos. Do not publish from this app.";
  return "Internal CTA rule only. No send, publish, launch, spend, or contact action without approval.";
}

function DecisionForms({ item, agentName }: { item: ApprovalCard; agentName: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Human decision</span>
        <StatusPill tone="amber">{item.statusLabel}</StatusPill>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
        <DecisionButton action="approve" itemId={item.id} label="Approve" variant="primary" />
        <DecisionButton action="reject" itemId={item.id} label="Decline" variant="ghost" />
        <DecisionButton action="archive" itemId={item.id} label="Archive" variant="ghost" />
      </div>
      <form action={decideApprovalItemAction} className="mt-3">
        <input name="approvalItemId" type="hidden" value={item.id} />
        <input name="decisionAction" type="hidden" value="revise" />
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Revision note
          </span>
          <textarea
            className="min-h-24 w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            name="notes"
            placeholder={`Tell ${agentName} what needs to change...`}
          />
        </label>
        <Button className="mt-2 w-full" size="sm" type="submit" variant="ghost">
          Request revision
        </Button>
      </form>
    </div>
  );
}

function DecisionButton({
  action,
  itemId,
  label,
  variant,
}: {
  action: "approve" | "reject" | "archive";
  itemId: string;
  label: string;
  variant: "primary" | "ghost";
}) {
  return (
    <form action={decideApprovalItemAction}>
      <input name="approvalItemId" type="hidden" value={itemId} />
      <input name="decisionAction" type="hidden" value={action} />
      <input name="notes" type="hidden" value={`${label} selected from approval packet.`} />
      <Button className="w-full" size="sm" type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

function DraftPreview({ item }: { item: ApprovalCard }) {
  if (item.structuredDraft?.kind === "partner_lead_list") {
    return (
      <PacketSection title="Lead list preview">
        <p className="mb-3 text-sm leading-6 text-[var(--text-secondary)]">
          {item.structuredDraft.candidates.length} candidates for {item.structuredDraft.targetMarket}
        </p>
        <div className="space-y-3">
          {item.structuredDraft.candidates.map((candidate) => (
            <LeadCandidateCard candidate={candidate} key={candidate.companyName} />
          ))}
        </div>
      </PacketSection>
    );
  }

  if (item.structuredDraft?.kind === "structured_fields") {
    return (
      <PacketSection title={item.structuredDraft.title}>
        <p className="mb-3 text-sm leading-6 text-[var(--text-secondary)]">{item.structuredDraft.summary}</p>
        <StructuredSectionList sections={item.structuredDraft.sections} />
      </PacketSection>
    );
  }

  const readableSections = buildReadableDraftSections(item.draftOutput);
  if (readableSections.length > 0) {
    return (
      <PacketSection title="Draft preview">
        <StructuredSectionList sections={readableSections} />
      </PacketSection>
    );
  }

  return (
    <PacketSection title="Draft preview">
      <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
        {item.draftOutput || "No draft body was captured."}
      </p>
    </PacketSection>
  );
}

function LeadCandidateCard({ candidate }: { candidate: ApprovalLeadCandidate }) {
  return (
    <article className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-bold text-[var(--text-primary)]">{candidate.companyName}</h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {candidate.persona}
          </p>
        </div>
        {typeof candidate.partnerScore === "number" ? <StatusPill tone="blue">Score {candidate.partnerScore}</StatusPill> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{candidate.evidenceSummary}</p>
      <div className="mt-3 grid gap-2">
        {candidate.phone ? <CompactField label="Phone" value={candidate.phone} /> : null}
        {candidate.confidence ? <CompactField label="Confidence" value={candidate.confidence} /> : null}
        <CompactField label="Next action" value={candidate.recommendedNextAction} />
      </div>
      {candidate.sourceUrls.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidate.sourceUrls.slice(0, 3).map((url) => (
            <a className={buttonClasses({ variant: "ghost", size: "sm" })} href={url} key={url} rel="noreferrer" target="_blank">
              Source
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function StructuredSectionList({ sections }: { sections: ApprovalStructuredSection[] }) {
  return (
    <div className="space-y-2">
      {sections.map((section) => (
        <CompactField key={section.label} label={section.label} value={section.value} />
      ))}
    </div>
  );
}

function FlagList({
  empty,
  items,
  title,
  tone,
}: {
  empty: string;
  items: string[];
  title: string;
  tone: "amber" | "blue";
}) {
  return (
    <PacketSection title={title}>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <StatusPill key={item} tone={tone}>
              {item}
            </StatusPill>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{empty}</p>
      )}
    </PacketSection>
  );
}

function EvidenceList({ urls }: { urls: string[] }) {
  return (
    <PacketSection title="Evidence and sources">
      {urls.length > 0 ? (
        <div className="space-y-2">
          {urls.slice(0, 8).map((url) => (
            <a
              className="block truncate rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              href={url}
              key={url}
              rel="noreferrer"
              target="_blank"
            >
              {url}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-[var(--text-secondary)]">No source links were captured for this packet.</p>
      )}
    </PacketSection>
  );
}

function CreativeAssetList({ item }: { item: ApprovalCard }) {
  if (item.creativeAssets.length === 0) {
    return null;
  }

  return (
    <PacketSection title="Creative assets">
      <div className="grid gap-3">
        {item.creativeAssets.map((asset) => (
          <a
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
            href={asset.url}
            key={asset.id}
            rel="noreferrer"
            target="_blank"
          >
            {asset.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" src={asset.thumbnailUrl ?? asset.url} />
            ) : null}
            <div className="font-bold text-[var(--text-primary)]">{asset.title}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{asset.type}</div>
            {asset.description ? <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{asset.description}</p> : null}
          </a>
        ))}
      </div>
    </PacketSection>
  );
}

function PacketSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{title}</h3>
      {children}
    </section>
  );
}

function CompactField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-5 text-[var(--text-primary)]">
        {value || "Missing"}
      </div>
    </div>
  );
}

function buildReadableDraftSections(value: string): ApprovalStructuredSection[] {
  const parsed = parseJsonObject(value);
  if (!parsed) return [];

  return Object.entries(parsed)
    .filter(([key, sectionValue]) => isReadableKey(key) && sectionValue !== null && sectionValue !== undefined)
    .flatMap(([key, sectionValue]) => readableValue(key, sectionValue))
    .slice(0, 14);
}

function readableValue(key: string, value: unknown): ApprovalStructuredSection[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [{ label: humanize(key), value: String(value) }];
  }

  if (Array.isArray(value)) {
    const readable = value
      .map((item) => (typeof item === "string" ? item : isRecord(item) ? compactObject(item) : ""))
      .filter(Boolean);
    return readable.length > 0 ? [{ label: humanize(key), value: readable.join("\n") }] : [];
  }

  if (isRecord(value)) {
    const compacted = compactObject(value);
    return compacted ? [{ label: humanize(key), value: compacted }] : [];
  }

  return [];
}

function compactObject(value: Record<string, unknown>) {
  return Object.entries(value)
    .filter(([key, nestedValue]) => isReadableKey(key) && nestedValue !== null && nestedValue !== undefined && typeof nestedValue !== "object")
    .map(([key, nestedValue]) => `${humanize(key)}: ${String(nestedValue)}`)
    .join("\n");
}

function parseJsonObject(value: string) {
  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    const parsed = JSON.parse(value.slice(firstBrace, lastBrace + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isReadableKey(key: string) {
  const normalized = key.toLowerCase();
  return !normalized.endsWith("_id") && !normalized.endsWith("_ids") && normalized !== "id" && !/payload|metadata|audit/.test(normalized);
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function riskTone(risk: string): "amber" | "red" | "green" | "blue" | "gray" {
  if (/blocked|high/i.test(risk)) return "red";
  if (/medium|warning/i.test(risk)) return "amber";
  if (/low/i.test(risk)) return "green";
  return "gray";
}
