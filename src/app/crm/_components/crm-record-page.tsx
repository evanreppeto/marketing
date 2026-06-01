import Link from "next/link";
import { notFound } from "next/navigation";

import { getPersistedPersonaIntelligenceForRecord } from "@/lib/persona-intelligence/read-model";

import { AppShell } from "../../_components/app-shell";
import { ActionFeedback, EmptyState, PageHeader, Panel, StatusPill } from "../../_components/page-header";
import { crmObjects } from "../../_data/growth-engine";
import { CrmRecordForm } from "./crm-record-form";
import { isCrmEntityKey } from "../entity-keys";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

const RECORD_FEEDBACK = ["created", "updated", "crm-error", "not-configured"];

type CrmObjectKey = (typeof crmObjects)[number]["key"];
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
    detail: "Log internal context for Hermes and the CRM timeline.",
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
    detail: "Create an operations handoff only after the lead is qualified.",
    state: "Locked",
    tone: "red",
    icon: "J",
  },
  {
    key: "approve",
    label: "Approve message",
    detail: "Use the approval queue for outbound copy decisions.",
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

const objectRelationships: Record<CrmObjectKey, Array<{ label: string; value: string; href: string }>> = {
  companies: [
    { label: "Primary contact", value: "Emilia Davi", href: "/crm/contacts/emilia-davi" },
    { label: "Open leads", value: "Needs live link", href: "/crm/leads" },
    { label: "Revenue attribution", value: "Needs live attribution", href: "/crm/outcomes/18420-closed" },
  ],
  contacts: [
    { label: "Company", value: "North Branch Insurance", href: "/crm/companies/north-branch-insurance" },
    { label: "Latest lead", value: "Basement flooding", href: "/crm/leads/basement-flooding" },
    { label: "Property", value: "1234 W Addison St", href: "/crm/properties/1234-w-addison-st" },
  ],
  properties: [
    { label: "Owner/contact", value: "Marlene Vega", href: "/crm/contacts/marlene-vega" },
    { label: "Latest lead", value: "Basement flooding", href: "/crm/leads/basement-flooding" },
    { label: "Active job", value: "J-2044 Basement mitigation", href: "/crm/jobs/j-2044-basement-mitigation" },
  ],
  leads: [
    { label: "Contact", value: "Marlene Vega", href: "/crm/contacts/marlene-vega" },
    { label: "Property", value: "1234 W Addison St", href: "/crm/properties/1234-w-addison-st" },
    { label: "Potential job", value: "J-2044 Basement mitigation", href: "/crm/jobs/j-2044-basement-mitigation" },
  ],
  jobs: [
    { label: "Origin lead", value: "Basement flooding", href: "/crm/leads/basement-flooding" },
    { label: "Property", value: "1234 W Addison St", href: "/crm/properties/1234-w-addison-st" },
    { label: "Outcome", value: "$18,420 closed", href: "/crm/outcomes/18420-closed" },
  ],
  outcomes: [
    { label: "Source company", value: "North Branch Insurance", href: "/crm/companies/north-branch-insurance" },
    { label: "Origin lead", value: "Basement flooding", href: "/crm/leads/basement-flooding" },
    { label: "Completed job", value: "J-2044 Basement mitigation", href: "/crm/jobs/j-2044-basement-mitigation" },
  ],
};

export async function CrmRecordPage({ action, objectKey, recordId }: CrmRecordPageProps) {
  const crmObject = crmObjects.find((object) => object.key === objectKey);

  if (!crmObject || !isUuid(recordId)) {
    notFound();
  }

  const record = {
    id: recordId,
    name: `${crmObject.label} record ${recordId.slice(0, 8)}`,
    detail: "Persisted Supabase record",
    status: "Active",
    owner: "Supabase",
    updated: "Live",
  };
  const actionMessage = action
    ? `"${actionLabels[action] ?? action}" is not connected to a write workflow yet.`
    : "Record write actions stay locked until the Hermes workflow API is finished.";
  const showEditForm = action === "edit" && isCrmEntityKey(objectKey);
  const feedbackAction = RECORD_FEEDBACK.includes(action ?? "") ? action : undefined;
  let editValues: Record<string, unknown> | undefined;
  if (showEditForm && isCrmEntityKey(objectKey) && isSupabaseAdminConfigured()) {
    const { data } = await getSupabaseAdminClient().from(objectKey).select("*").eq("id", recordId).maybeSingle();
    editValues = (data as Record<string, unknown> | null) ?? undefined;
  }

  const persistedPersonaIntelligence = await getPersistedPersonaIntelligenceForRecord(record.id);
  const personaSnapshot = persistedPersonaIntelligence.snapshot;
  const engagementEvents =
    persistedPersonaIntelligence.status === "live" ? persistedPersonaIntelligence.engagementEvents : [];
  const nextBestActions =
    persistedPersonaIntelligence.status === "live" ? persistedPersonaIntelligence.nextBestActions : [];

  return (
    <AppShell active="/crm">
      <PageHeader
        eyebrow={`${crmObject.label} Record`}
        title={record.name}
        description={record.detail}
        aside={<StatusPill tone={statusTone(record.status)}>{record.status}</StatusPill>}
      />

      <ActionFeedback
        action={feedbackAction}
        messages={{
          created: `${crmObject.label} record created.`,
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

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.25fr)_minmax(340px,0.78fr)]">
        <Panel className="module-rise [animation-delay:70ms]">
          <div className="signal-eyebrow">Record summary</div>
          <div className="mt-5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] p-5">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">{record.id}</div>
            <div className="mt-3 font-display text-2xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">{record.name}</div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{record.detail}</p>
          </div>

          <div className="mt-4 grid gap-3">
            {[
              ["Owner", record.owner],
              ["Updated", record.updated],
              ["Object", crmObject.label],
              ["Mode", isUuid(record.id) ? "Supabase record" : "Legacy local record"],
            ].map(([label, value]) => (
              <div className="signal-inset rounded-md border p-4" key={label}>
                <div className="text-sm text-[var(--text-muted)]">{label}</div>
                <div className="mt-2 font-semibold text-[var(--text-primary)]">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {isCrmEntityKey(objectKey) ? (
              <Link
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-strong)] active:-translate-y-px"
                href={`${crmObject.href}/${recordId}?action=edit`}
              >
                Edit details
              </Link>
            ) : null}
            <Link
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] active:-translate-y-px"
              href={crmObject.href}
            >
              Back to {crmObject.label}
            </Link>
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:120ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Persona snapshot</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">Living profile context that should drive message and action choices.</p>
                </div>
                {personaSnapshot ? <StatusPill tone="blue">{personaSnapshot.confidence}</StatusPill> : null}
              </div>
              <div className="signal-inset mt-3 rounded-md border px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
                {persistedPersonaIntelligence.message}
              </div>
            </div>
            {personaSnapshot ? (
              <div className="grid border-b border-[var(--border-hairline)] lg:grid-cols-[0.9fr_1.1fr]">
                <div className="border-b border-[var(--border-hairline)] p-5 lg:border-b-0 lg:border-r">
                  <div className="signal-eyebrow">
                    {personaSnapshot.basePersona}
                  </div>
                  <div className="mt-2 font-display text-2xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">
                    {personaSnapshot.nextBestAction}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{personaSnapshot.messagePosture}</p>
                </div>
                <div className="grid sm:grid-cols-2">
                  {[
                    ["Relationship", personaSnapshot.relationshipStage],
                    ["Value tier", personaSnapshot.valueTier],
                    ["Loss pattern", personaSnapshot.dominantLossPattern],
                    ["Channel", personaSnapshot.preferredChannel],
                  ].map(([label, value]) => (
                    <div className="min-w-0 border-b border-[var(--border-hairline)] p-4 even:sm:border-l sm:[&:nth-last-child(-n+2)]:border-b-0" key={label}>
                      <div className="text-xs text-[var(--text-muted)]">{label}</div>
                      <div className="token-value mt-1 font-semibold text-[var(--text-primary)]">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-b border-[var(--border-hairline)] p-5">
                <EmptyState
                  title="No persona snapshot"
                  detail="This record does not have a live persona snapshot yet. Mark can create one through a queued persona classification task."
                />
              </div>
            )}
            <div className="grid gap-2 p-5 sm:grid-cols-2">
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] active:-translate-y-px"
                href="/persona-intelligence"
              >
                Open persona intelligence
              </Link>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[oklch(0.18_0.03_248)] transition hover:bg-[var(--accent-strong)] active:-translate-y-px"
                href="/ai-studio?action=generate-asset"
              >
                Create approved asset
              </Link>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:150ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-5">
              <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Engagement timeline</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Events that feed the profile and future next-best-action engine.</p>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {engagementEvents.length > 0 ? engagementEvents.map((item) => (
                <div className="grid gap-4 px-5 py-5 md:grid-cols-[120px_1fr]" key={`${item.event}-${item.time}`}>
                  <div className="font-mono text-sm font-semibold text-[var(--text-muted)]">{item.time}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-[var(--text-primary)]">{item.event}</div>
                      <StatusPill tone="blue">{item.channel}</StatusPill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.detail}</p>
                  </div>
                </div>
              )) : (
                <div className="p-5">
                  <EmptyState title="No engagement events" detail="Live calls, emails, notes, and agent actions will appear here once they are written to Supabase." />
                </div>
              )}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Related records</h2>
            <div className="mt-5 space-y-3">
              {objectRelationships[objectKey].map((relationship) => (
                <Link
                  className="block rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] active:-translate-y-px"
                  href={relationship.href}
                  key={relationship.label}
                >
                  <div className="text-sm text-[var(--text-muted)]">{relationship.label}</div>
                  <div className="mt-2 font-semibold text-[var(--text-primary)]">{relationship.value}</div>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:220ms]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Next Best Actions</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Record tools are staged here, but write actions stay disabled until the Hermes workflow API is finished.
                </p>
              </div>
              <StatusPill tone="amber">Locked</StatusPill>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{actionMessage}</p>
            <div className="mt-5 grid gap-3">
              {nextBestActions.length > 0 ? nextBestActions.map((item) => (
                <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={item.action}>
                  <div className="font-semibold text-[var(--text-primary)]">{item.action}</div>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{item.reason}</p>
                  <div className="mt-2 text-xs font-semibold text-[var(--accent)]">{item.approval}</div>
                </div>
              )) : (
                <EmptyState title="No next best actions" detail="Live recommendations will appear here after Mark or Hermes writes them for this record." />
              )}
            </div>
            <div className="mt-5 grid gap-2 border-t border-[var(--border-hairline)] pt-5">
              {actionCards.map((item) => (
                <Link
                  aria-disabled="true"
                  className={`grid min-h-[76px] grid-cols-[40px_1fr_auto] items-center gap-3 rounded-md border px-3 py-3 text-left transition active:-translate-y-px ${
                    action === item.key
                      ? actionCardActiveClass(item.tone)
                      : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                  }`}
                  href={`${crmObject.href}/${record.id}?action=${item.key}`}
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
        </div>
      </div>
    </AppShell>
  );
}

export function getCrmRecordParams(objectKey: CrmObjectKey) {
  void objectKey;
  return [];
}

function statusTone(status: string): "amber" | "green" | "red" {
  if (["Active", "Ready", "Won", "High priority"].includes(status)) {
    return "green";
  }

  if (["Out of scope", "Fix"].includes(status)) {
    return "red";
  }

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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
