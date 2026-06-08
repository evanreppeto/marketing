import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../_components/app-shell";
import { IntelligencePanel } from "../../_components/intelligence-panel";
import { ActionFeedback, EmptyState, PageHeader, Panel, StatusPill, buttonClasses } from "../../_components/page-header";
import { CrmRecordForm } from "./crm-record-form";
import { isCrmEntityKey } from "../entity-keys";
import { getCrmRecordData, type CrmObjectKey, type CrmRecordData } from "@/lib/crm/read-model";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { getCampaignsForRecord, type LinkedCampaignRecordKind } from "@/lib/campaigns/read-model";
import { LinkedCampaignsPanel } from "./linked-campaigns-panel";

const RECORD_FEEDBACK = ["created", "updated", "crm-error", "not-configured"];

type CrmRecordPageProps = {
  action?: string;
  objectKey: CrmObjectKey;
  recordId: string;
};

const actionLabels: Record<string, string> = {
  note: "Add note",
  owner: "Assign owner",
  convert: "Convert to job",
  approve: "Approve message",
  property: "Link property",
};

const actionCards = [
  {
    key: "note",
    label: "Add note",
    detail: "Log internal context for Mark and the CRM timeline.",
    state: "Locked",
    tone: "blue",
    icon: "N",
  },
  {
    key: "owner",
    label: "Assign owner",
    detail: "Route the record to a human operator before action.",
    state: "Locked",
    tone: "gray",
    icon: "O",
  },
  {
    key: "convert",
    label: "Convert to job",
    detail: "Create an operations handoff only after qualification.",
    state: "Locked",
    tone: "red",
    icon: "J",
  },
  {
    key: "approve",
    label: "Approval queue",
    detail: "Outbound copy decisions belong in the approval queue.",
    state: "Use approvals",
    tone: "green",
    icon: "A",
  },
  {
    key: "property",
    label: "Link property",
    detail: "Attach address context for scoring and routing.",
    state: "Locked",
    tone: "blue",
    icon: "P",
  },
] as const;

export async function CrmRecordPage({ action, objectKey, recordId }: CrmRecordPageProps) {
  if (!isUuid(recordId)) {
    notFound();
  }

  const recordResult = await getCrmRecordData(objectKey, recordId);

  if (recordResult.status === "not_found") {
    notFound();
  }

  if (recordResult.status === "unavailable") {
    return (
      <AppShell active="/crm">
        <PageHeader eyebrow="CRM record" title="Record unavailable" description={recordResult.message} />
        <EmptyState title="Could not load this record" detail="The CRM database connection or table query failed." />
      </AppShell>
    );
  }

  const record = recordResult;
  const linkKind = recordLinkKind(objectKey);
  const linkedCampaigns = linkKind ? await getCampaignsForRecord(linkKind, recordId) : [];
  const actionMessage = action
    ? `"${actionLabels[action] ?? action}" is not connected to a write workflow yet.`
    : "Record write actions stay locked until a human-approved workflow is available.";
  const showEditForm = action === "edit" && isCrmEntityKey(objectKey);
  const feedbackAction = RECORD_FEEDBACK.includes(action ?? "") ? action : undefined;
  let editValues: Record<string, unknown> | undefined;

  if (showEditForm && isSupabaseAdminConfigured()) {
    const { data } = await getSupabaseAdminClient().from(objectKey).select("*").eq("id", recordId).maybeSingle();
    editValues = (data as Record<string, unknown> | null) ?? undefined;
  }

  return (
    <AppShell active="/crm">
      <PageHeader
        eyebrow={`${record.label} record`}
        title={record.name}
        description={record.detail}
        aside={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={statusTone(record.lifecycleStatus)}>{record.lifecycleStatus}</StatusPill>
            <StatusPill tone="amber">Outbound locked</StatusPill>
          </div>
        }
      />

      <ActionFeedback
        action={feedbackAction}
        messages={{
          created: `${record.label} record created.`,
          updated: "Changes saved.",
          "crm-error": "That change could not be saved. Check the fields and try again.",
          "not-configured": "Supabase is not connected, so nothing was written.",
        }}
      />

      {showEditForm && isCrmEntityKey(objectKey) ? (
        <div className="mb-4">
          <CrmRecordForm objectKey={objectKey} mode="edit" recordId={recordId} values={editValues} />
        </div>
      ) : null}

      <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <RecordSummary record={record} />
          <RecordFields record={record} />
          <RelatedRecords record={record} />
          <LinkedCampaignsPanel campaigns={linkedCampaigns} />
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: `${record.label} intelligence`,
              persona: record.persona,
              confidence: record.confidence,
              journeyStage: record.journeyStage,
              urgency: record.urgency,
              attentionReason: record.attentionReason,
              nextBestAction: record.nextBestAction,
              cta: record.cta,
              messageAngle: record.messageAngle,
              guardrailStatus: record.guardrailStatus,
              scores: [
                { label: "Lead", value: record.leadScore, detail: "Lead score", tone: record.leadScore === null ? "gray" : undefined },
                { label: "Partner", value: record.partnerScore, detail: "Partner fit", tone: record.partnerScore === null ? "gray" : undefined },
                { label: "Revenue", value: record.revenueScore, detail: "Revenue signal", tone: record.revenueScore ? "green" : "gray" },
              ],
              proofPoints: record.proofPoints,
              evidence: record.evidence,
              outboundLocked: true,
            }}
          />

          <MissingFields record={record} />
          <NextActions record={record} action={action} actionMessage={actionMessage} />
        </aside>
      </div>
    </AppShell>
  );
}

export function getCrmRecordParams(objectKey: CrmObjectKey) {
  void objectKey;
  return [];
}

function RecordSummary({ record }: { record: CrmRecordData }) {
  return (
    <Panel className="module-rise">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="signal-eyebrow">Record summary</div>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{record.name}</h2>
          <p className="mt-2 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">{record.detail}</p>
        </div>
        <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={`/crm/${record.key}`}>
          Back to {record.label}
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Owner", record.owner],
          ["Updated", formatDate(record.updated)],
          ["Object", record.label],
          ["Record id", record.id],
        ].map(([label, value]) => (
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={label}>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
            <div className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RecordFields({ record }: { record: CrmRecordData }) {
  return (
    <Panel className="module-rise p-0">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="signal-eyebrow">Stored fields</div>
        <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">What the database knows</h2>
      </div>
      <dl className="divide-y divide-[var(--border-hairline)]">
        {record.fields.map((field) => (
          <div key={field.label} className="grid gap-3 px-5 py-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{field.label}</dt>
            <dd className={`min-w-0 text-sm font-semibold leading-6 ${field.value === "Missing" ? "text-[var(--warn)]" : "text-[var(--text-primary)]"}`}>
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function RelatedRecords({ record }: { record: CrmRecordData }) {
  return (
    <Panel className="module-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="signal-eyebrow">Relationships</div>
          <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">Connected CRM records</h2>
        </div>
        <StatusPill tone={record.relationships.length > 0 ? "blue" : "gray"}>{record.relationships.length}</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {record.relationships.length > 0 ? (
          record.relationships.map((relationship) => (
            <Link
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
              href={relationship.href}
              key={`${relationship.label}-${relationship.href}`}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{relationship.label}</div>
              <div className="mt-1 font-bold text-[var(--text-primary)]">{relationship.value}</div>
            </Link>
          ))
        ) : (
          <EmptyState title="No relationships linked" detail="This record needs relationship mapping before Mark can use it confidently." />
        )}
      </div>
    </Panel>
  );
}

function MissingFields({ record }: { record: CrmRecordData }) {
  return (
    <Panel className="module-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="signal-eyebrow">Data contract</div>
          <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">Missing fields</h2>
        </div>
        <StatusPill tone={record.missingFields.length > 0 ? "amber" : "green"}>
          {record.missingFields.length > 0 ? "Needs enrichment" : "Ready"}
        </StatusPill>
      </div>
      <div className="mt-4 grid gap-2">
        {record.missingFields.length > 0 ? (
          record.missingFields.map((field) => (
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]" key={field}>
              {field}
            </div>
          ))
        ) : (
          <p className="text-sm leading-6 text-[var(--text-secondary)]">No obvious required fields are missing for this record type.</p>
        )}
      </div>
    </Panel>
  );
}

function NextActions({
  record,
  action,
  actionMessage,
}: {
  record: CrmRecordData;
  action?: string;
  actionMessage: string;
}) {
  return (
    <Panel className="module-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="signal-eyebrow">Human gate</div>
          <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">Locked record tools</h2>
        </div>
        <StatusPill tone="amber">Locked</StatusPill>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{actionMessage}</p>
      <div className="mt-4 grid gap-3">
        {actionCards.map((item) => (
          <Link
            aria-disabled="true"
            className={`grid min-h-[76px] grid-cols-[40px_1fr_auto] items-center gap-3 rounded-lg border px-3 py-3 text-left transition active:-translate-y-px ${
              action === item.key
                ? actionCardActiveClass(item.tone)
                : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
            }`}
            href={`/crm/${record.key}/${record.id}?action=${item.key}`}
            key={item.key}
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-md border text-sm font-bold ${actionIconClass(item.tone)}`}>
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">{item.detail}</span>
            </span>
            <StatusPill tone={item.tone === "red" ? "red" : item.tone === "green" ? "green" : item.tone === "blue" ? "blue" : "gray"}>
              {item.state}
            </StatusPill>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function statusTone(status: string): "amber" | "green" | "red" {
  const lower = status.toLowerCase();
  if (["active", "ready", "won", "high priority", "qualified", "converted", "completed"].includes(lower)) return "green";
  if (["out of scope", "lost", "inactive", "do not contact", "do_not_contact"].includes(lower)) return "red";
  return "amber";
}

function actionIconClass(tone: string) {
  if (tone === "red") return "border-[oklch(0.68_0.2_26/0.4)] bg-[oklch(0.68_0.2_26/0.16)] text-[oklch(0.86_0.09_26)]";
  if (tone === "green") return "border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.14)] text-[oklch(0.88_0.1_158)]";
  if (tone === "blue") return "border-[oklch(0.74_0.115_232/0.4)] bg-[var(--accent-soft)] text-[var(--accent)]";
  return "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-secondary)]";
}

function actionCardActiveClass(tone: string) {
  if (tone === "red") return "border-[oklch(0.68_0.2_26/0.5)] bg-[oklch(0.68_0.2_26/0.14)] text-[var(--text-primary)]";
  if (tone === "green") return "border-[oklch(0.78_0.14_158/0.5)] bg-[oklch(0.78_0.14_158/0.12)] text-[var(--text-primary)]";
  if (tone === "blue") return "border-[oklch(0.74_0.115_232/0.5)] bg-[var(--accent-soft)] text-[var(--text-primary)]";
  return "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)]";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function recordLinkKind(objectKey: CrmObjectKey): LinkedCampaignRecordKind | null {
  switch (objectKey) {
    case "companies":
      return "company";
    case "contacts":
      return "contact";
    case "leads":
      return "lead";
    case "properties":
      return "property";
    default:
      return null; // jobs / outcomes are not referenced by campaigns
  }
}
