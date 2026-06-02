import Link from "next/link";
import { connection } from "next/server";

import { DataTable } from "../_components/data-table";
import { IntelligencePanel } from "../_components/intelligence-panel";
import { Button, EmptyState, StatusPill, buttonClasses } from "../_components/page-header";
import { MetricStrip, WorkspacePanel } from "../_components/workspace";
import { decideApprovalItemAction } from "./actions";
import { listApprovalCards, type ApprovalCard } from "@/lib/approvals/read-model";

type ApprovalsPageProps = {
  searchParams?: Promise<{ item?: string | string[]; action?: string | string[]; message?: string | string[] }>;
};

const actionMessages: Record<string, string> = {
  approve: "Approved. The database decision was recorded; outbound is still locked until the next explicit approved workflow step.",
  reject: "Rejected. The item remains blocked from external use.",
  revise: "Revision requested. Mark can prepare a safer version.",
  archive: "Archived. The approval item left the active queue.",
  error: "The decision failed. Review the error before trying again.",
};

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const selectedId = getValue(query.item);
  const message = getValue(query.message);
  const { cards, error } = await loadApprovalCards();
  const selected = cards.find((card) => card.id === selectedId) ?? cards[0] ?? null;
  const mediaCount = cards.reduce((sum, card) => sum + card.creativeAssets.length, 0);
  const blockedCount = cards.filter((card) => card.riskLevel === "blocked" || card.riskLevel === "high").length;

  return (
    <>
      <header className="module-rise mb-5 rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-6 py-5 shadow-[var(--elev-panel)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">Approval Queue</span>
              <StatusPill tone={cards.length > 0 ? "amber" : "green"}>{cards.length} waiting</StatusPill>
              <StatusPill tone="amber">Outbound locked</StatusPill>
            </div>
            <h1 className="mt-3 max-w-3xl text-[clamp(1.8rem,3vw,3.2rem)] font-black leading-[0.98] tracking-[-0.05em] text-[var(--text-primary)]">
              Review what Mark created before it moves.
            </h1>
            <p className="mt-3 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">
              Campaigns, lead lists, ads, copy, and recommendations stay internal until a human approves, rejects, revises, or archives them.
            </p>
          </div>
          <Link className={buttonClasses({ variant: "ghost" })} href="/agent-operations">
            Open Mark tasks
          </Link>
        </div>
      </header>

      {action ? (
        <div className="module-rise mb-5 rounded-lg border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--chicago-blue-soft)]">
          <span className="font-semibold text-[var(--text-primary)]">Update: </span>
          {actionMessages[action] ?? "Decision recorded."}
          {message ? <span className="block pt-1 text-[oklch(0.86_0.09_26)]">{message}</span> : null}
        </div>
      ) : null}

      {error ? (
        <div className="module-rise mb-5 rounded-lg border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Approval queue unavailable: </span>
          {error}
        </div>
      ) : null}

      <MetricStrip
        metrics={[
          { label: "Review items", value: cards.length, detail: "Active approval records", tone: cards.length > 0 ? "amber" : "green" },
          { label: "Media", value: mediaCount, detail: "Images, video, files, links", tone: mediaCount > 0 ? "blue" : "gray" },
          { label: "Guardrail flags", value: blockedCount, detail: "High or blocked risk", tone: blockedCount > 0 ? "red" : "green" },
          { label: "Selected", value: selected ? "1" : "0", detail: selected?.statusLabel ?? "No item selected", tone: selected ? "blue" : "gray" },
        ]}
      />

      {selected ? (
        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <WorkspacePanel
            className="p-0"
            eyebrow="Queue"
            title="Approval packets"
            description="Open a packet to inspect the draft, evidence, related CRM records, guardrails, and recommended human action."
            aside={<StatusPill tone="amber">Human gate</StatusPill>}
          >
            <DataTable
              rows={cards}
              rowKey={(row) => row.id}
              isSelected={(row) => row.id === selected.id}
              minWidth="min-w-[960px]"
              columns={[
                {
                  key: "item",
                  header: "Created item",
                  cell: (row) => (
                    <>
                      <Link className="font-bold text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={`/approvals?item=${row.id}`}>
                        {row.title}
                      </Link>
                      <div className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{row.previewText}</div>
                    </>
                  ),
                },
                { key: "persona", header: "Persona", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.persona },
                { key: "status", header: "Status", cell: (row) => <StatusPill tone={statusTone(row.status)}>{row.statusLabel}</StatusPill> },
                { key: "risk", header: "Risk", cell: (row) => <StatusPill tone={riskTone(row.riskLevel)}>{row.riskLevel}</StatusPill> },
                { key: "agent", header: "Created by", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.sourceAgent },
                { key: "submitted", header: "Submitted", cellClassName: "text-[var(--text-secondary)]", cell: (row) => formatDate(row.submittedAt) },
              ]}
            />
          </WorkspacePanel>

          <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
            <ApprovalDetail card={selected} />
          </aside>
        </div>
      ) : (
        <WorkspacePanel>
          <EmptyState
            title="No active approvals"
            detail="There are no pending approval items in the database. Mark can prepare new work from the task queue, but outbound remains locked."
            action={<Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/agent-operations">Open Mark tasks</Link>}
          />
        </WorkspacePanel>
      )}
    </>
  );
}

function ApprovalDetail({ card }: { card: ApprovalCard }) {
  const related = [card.relatedRecords.company, card.relatedRecords.contact, card.relatedRecords.lead].filter(Boolean);
  return (
    <>
      <IntelligencePanel
        model={{
          title: card.title,
          persona: card.persona,
          confidence: card.structuredDraft ? "Structured" : card.evidence.length > 0 ? "Evidence linked" : "Needs evidence",
          journeyStage: card.statusLabel,
          urgency: card.riskLevel,
          attentionReason: card.previewText,
          nextBestAction: card.recommendedAction,
          cta: "Approve only if the draft, audience, evidence, and guardrails are acceptable.",
          messageAngle: `${card.channel} / ${card.campaign.name}`,
          guardrailStatus: [...card.complianceFlags, ...card.riskFlags].join(" / ") || "Human approval required.",
          scores: [
            { label: "Evidence", value: card.evidence.length, detail: "Source links attached", tone: card.evidence.length > 0 ? "blue" : "gray" },
            { label: "Media", value: card.creativeAssets.length, detail: "Creative previews", tone: card.creativeAssets.length > 0 ? "blue" : "gray" },
            { label: "Records", value: related.length, detail: "Linked CRM records", tone: related.length > 0 ? "green" : "gray" },
          ],
          proofPoints: related.map((record) => `${record?.label}: ${record?.detail}`),
          evidence: card.evidence.map((href) => ({ label: sourceLabel(href), href })),
          outboundLocked: true,
        }}
      />

      <WorkspacePanel
        eyebrow="Draft"
        title="Created content"
        description="Readable preview of the generated work. Use revision when the safe next step is to ask Mark to change it."
      >
        <div className="space-y-4 p-4">
          <ReadableDraft card={card} />
          <RelatedRecordLinks card={card} />
          {card.creativeAssets.length > 0 ? (
            <div className="grid gap-2">
              <div className="signal-eyebrow">Media attached</div>
              {card.creativeAssets.slice(0, 4).map((asset) => (
                <a className={buttonClasses({ variant: "ghost", size: "sm", className: "justify-between" })} href={asset.url} key={asset.id} rel="noreferrer" target="_blank">
                  <span className="truncate">{asset.title}</span>
                  <span className="text-[var(--text-muted)]">{asset.type}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </WorkspacePanel>

      <WorkspacePanel eyebrow="Decision" title="Human action">
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <DecisionForm action="approve" card={card} label="Approve" variant="primary" />
          <DecisionForm action="reject" card={card} label="Decline" variant="priority" />
          <DecisionForm action="revise" card={card} label="Request revision" variant="ghost" />
          <DecisionForm action="archive" card={card} label="Archive" variant="ghost" />
        </div>
        <p className="border-t border-[var(--border-hairline)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)]">
          Decisions update approval state only. This page does not send email, SMS, launch ads, publish pages, change spend, or contact leads.
        </p>
      </WorkspacePanel>
    </>
  );
}

function ReadableDraft({ card }: { card: ApprovalCard }) {
  if (card.structuredDraft?.kind === "partner_lead_list") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
          <div className="font-bold text-[var(--text-primary)]">{card.structuredDraft.leadListType}</div>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{card.structuredDraft.targetMarket}</p>
        </div>
        {card.structuredDraft.candidates.slice(0, 5).map((candidate) => (
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={candidate.companyName}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-[var(--text-primary)]">{candidate.companyName}</div>
              <StatusPill tone={candidate.partnerScore && candidate.partnerScore >= 80 ? "green" : "amber"}>{candidate.partnerScore ?? "Unscored"}</StatusPill>
            </div>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{candidate.evidenceSummary}</p>
          </div>
        ))}
      </div>
    );
  }

  if (card.structuredDraft?.kind === "structured_fields") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
          <div className="signal-eyebrow">Structured draft</div>
          <h3 className="mt-1 text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">{card.structuredDraft.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{card.structuredDraft.summary}</p>
        </div>
        <dl className="divide-y divide-[var(--border-hairline)] overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
          {card.structuredDraft.sections.map((section) => (
            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[170px_minmax(0,1fr)]" key={section.label}>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{section.label}</dt>
              <dd className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[var(--text-primary)]">{section.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <p className="max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 text-sm leading-6 text-[var(--text-primary)]">
      {card.draftOutput.trim() ? card.previewText : "No draft body attached."}
    </p>
  );
}

function RelatedRecordLinks({ card }: { card: ApprovalCard }) {
  const records = [
    card.relatedRecords.company ? { ...card.relatedRecords.company, href: `/crm/companies/${card.relatedRecords.company.id}` } : null,
    card.relatedRecords.contact ? { ...card.relatedRecords.contact, href: `/crm/contacts/${card.relatedRecords.contact.id}` } : null,
    card.relatedRecords.lead ? { ...card.relatedRecords.lead, href: `/crm/leads/${card.relatedRecords.lead.id}` } : null,
    card.campaign.id ? { id: card.campaign.id, label: card.campaign.name, detail: card.campaign.objective, href: `/campaigns/${card.campaign.id}` } : null,
  ].filter((record): record is { id: string; label: string; detail: string; href: string } => Boolean(record));

  if (records.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <div className="signal-eyebrow">Related records</div>
      {records.map((record) => (
        <Link className={buttonClasses({ variant: "ghost", size: "sm", className: "justify-between" })} href={record.href} key={`${record.href}-${record.id}`}>
          <span className="truncate">{record.label}</span>
          <span className="text-[var(--text-muted)]">{record.detail}</span>
        </Link>
      ))}
    </div>
  );
}

function DecisionForm({ action, card, label, variant }: { action: "approve" | "reject" | "revise" | "archive"; card: ApprovalCard; label: string; variant: "primary" | "priority" | "ghost" }) {
  return (
    <form action={decideApprovalItemAction}>
      <input name="approvalItemId" type="hidden" value={card.id} />
      <input name="decisionAction" type="hidden" value={action} />
      <input name="notes" type="hidden" value={`${label} selected from Growth Intelligence approval queue.`} />
      <Button className="w-full" type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

async function loadApprovalCards() {
  try {
    return { cards: await listApprovalCards(), error: null };
  } catch (error) {
    return { cards: [], error: error instanceof Error ? error.message : "Approval queue is unavailable." };
  }
}

function statusTone(status: string) {
  if (/approved/i.test(status)) return "green";
  if (/reject|decline|blocked/i.test(status)) return "red";
  if (/revision|pending|review|compliance/i.test(status)) return "amber";
  return "blue";
}

function riskTone(risk: string) {
  if (risk === "blocked" || risk === "high") return "red";
  if (risk === "medium") return "amber";
  return "green";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function sourceLabel(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "Evidence";
  }
}
