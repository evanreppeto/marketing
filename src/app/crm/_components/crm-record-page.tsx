import Link from "next/link";
import { notFound } from "next/navigation";

import { getPersistedPersonaIntelligenceForRecord } from "@/lib/persona-intelligence/read-model";

import { AppShell } from "../../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../../_components/page-header";
import {
  crmObjects,
  crmPersonaSnapshots,
  crmRecordEngagementEvents,
  leadEngagementEvents,
  leadHyperPersonaSnapshot,
  leadNextBestActions,
} from "../../_data/growth-engine";

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

const objectRelationships: Record<CrmObjectKey, Array<{ label: string; value: string; href: string }>> = {
  companies: [
    { label: "Primary contact", value: "Emilia Davi", href: "/crm/contacts/emilia-davi" },
    { label: "Open leads", value: "2 sample leads", href: "/crm/leads" },
    { label: "Revenue attribution", value: "$18,420 sample", href: "/crm/outcomes/18420-closed" },
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
  const record =
    crmObject?.sampleRows.find((row) => row.id === recordId) ??
    (crmObject && isUuid(recordId)
      ? {
          id: recordId,
          name: `${crmObject.label} record ${recordId.slice(0, 8)}`,
          detail: "Persisted Supabase record",
          status: "Active",
          owner: "Supabase",
          updated: "Live",
        }
      : undefined);

  if (!crmObject || !record) {
    notFound();
  }

  const actionMessage = action
    ? `Scaffold only: "${actionLabels[action] ?? action}" is previewed for this record.`
    : "No changes are written. These actions only prove the record layout.";
  const persistedPersonaIntelligence = await getPersistedPersonaIntelligenceForRecord(record.id);
  const personaSnapshot =
    persistedPersonaIntelligence.status === "live" && persistedPersonaIntelligence.snapshot
      ? persistedPersonaIntelligence.snapshot
      : (crmPersonaSnapshots[record.id] ?? leadHyperPersonaSnapshot);
  const engagementEvents =
    persistedPersonaIntelligence.status === "live" && persistedPersonaIntelligence.engagementEvents.length > 0
      ? persistedPersonaIntelligence.engagementEvents
      : (crmRecordEngagementEvents[record.id] ?? leadEngagementEvents);
  const nextBestActions =
    persistedPersonaIntelligence.status === "live" && persistedPersonaIntelligence.nextBestActions.length > 0
      ? persistedPersonaIntelligence.nextBestActions
      : leadNextBestActions;

  return (
    <AppShell active="/crm">
      <PageHeader
        eyebrow={`${crmObject.label} Record`}
        title={record.name}
        description={`${record.detail}. This detail page is mock-only scaffolding for the future CRM workspace.`}
        aside={<StatusPill tone={statusTone(record.status)}>{record.status}</StatusPill>}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.25fr)_minmax(340px,0.78fr)]">
        <Panel className="module-rise [animation-delay:70ms]">
          <div className="text-sm uppercase tracking-[0.16em] text-[#e7352f]">Record summary</div>
          <div className="mt-5 rounded-md bg-[#151515] p-5 text-white">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-white/55">{record.id}</div>
            <div className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{record.name}</div>
            <p className="mt-3 text-sm leading-6 text-white/68">{record.detail}</p>
          </div>

          <div className="mt-4 grid gap-3">
            {[
              ["Owner", record.owner],
              ["Updated", record.updated],
              ["Object", crmObject.label],
              ["Mode", "Mock scaffold"],
            ].map(([label, value]) => (
              <div className="rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4" key={label}>
                <div className="text-sm text-[#6e6962]">{label}</div>
                <div className="mt-2 font-semibold">{value}</div>
              </div>
            ))}
          </div>

          <Link
            className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition active:-translate-y-px"
            href={crmObject.href}
          >
            Back to {crmObject.label}
          </Link>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:120ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">Persona snapshot</h2>
                  <p className="mt-1 text-sm text-[#6e6962]">Living profile context that should drive message and action choices.</p>
                </div>
                <StatusPill tone="blue">{personaSnapshot.confidence}</StatusPill>
              </div>
              <div className="mt-3 rounded-md border border-[#eee8e1] bg-[#fbfaf8] px-3 py-2 text-xs leading-5 text-[#6e6962]">
                {persistedPersonaIntelligence.message}
              </div>
            </div>
            <div className="grid border-b border-[#eee8e1] lg:grid-cols-[0.9fr_1.1fr]">
              <div className="border-b border-[#eee8e1] p-5 lg:border-b-0 lg:border-r">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a07423]">
                  {personaSnapshot.basePersona}
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  {personaSnapshot.nextBestAction}
                </div>
                <p className="mt-3 text-sm leading-6 text-[#6e6962]">{personaSnapshot.messagePosture}</p>
              </div>
              <div className="grid sm:grid-cols-2">
                {[
                  ["Relationship", personaSnapshot.relationshipStage],
                  ["Value tier", personaSnapshot.valueTier],
                  ["Loss pattern", personaSnapshot.dominantLossPattern],
                  ["Channel", personaSnapshot.preferredChannel],
                ].map(([label, value]) => (
                  <div className="border-b border-[#eee8e1] p-4 even:sm:border-l sm:[&:nth-last-child(-n+2)]:border-b-0" key={label}>
                    <div className="text-xs text-[#6e6962]">{label}</div>
                    <div className="mt-1 font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-2 p-5 sm:grid-cols-2">
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
                href="/persona-intelligence"
              >
                Open persona intelligence
              </Link>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
                href="/ai-studio?action=generate-asset"
              >
                Create approved asset
              </Link>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:150ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Engagement timeline</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Events that feed the profile and future next-best-action engine.</p>
            </div>
            <div className="divide-y divide-[#eee8e1]">
              {engagementEvents.map((item) => (
                <div className="grid gap-4 px-5 py-5 md:grid-cols-[120px_1fr]" key={`${item.event}-${item.time}`}>
                  <div className="text-sm font-semibold text-[#6e6962]">{item.time}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold">{item.event}</div>
                      <StatusPill tone="blue">{item.channel}</StatusPill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#6e6962]">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Related records</h2>
            <div className="mt-5 space-y-3">
              {objectRelationships[objectKey].map((relationship) => (
                <Link
                  className="block rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4 transition hover:border-[#151515] hover:bg-white active:-translate-y-px"
                  href={relationship.href}
                  key={relationship.label}
                >
                  <div className="text-sm text-[#6e6962]">{relationship.label}</div>
                  <div className="mt-2 font-semibold">{relationship.value}</div>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:220ms]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">Next Best Actions</h2>
                <p className="mt-1 text-sm text-[#6e6962]">Preview recommendations until Supabase persistence is wired.</p>
              </div>
              <StatusPill tone="gray">Scaffold</StatusPill>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#6e6962]">{actionMessage}</p>
            <div className="mt-5 grid gap-3">
              {nextBestActions.map((item) => (
                <div className="rounded-md border border-[#eee8e1] bg-[#fbfaf8] p-3" key={item.action}>
                  <div className="font-semibold">{item.action}</div>
                  <p className="mt-1 text-sm leading-5 text-[#6e6962]">{item.reason}</p>
                  <div className="mt-2 text-xs font-semibold text-[#a07423]">{item.approval}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-2 border-t border-[#eee8e1] pt-5">
              {[
                ["note", "Add note"],
                ["owner", "Assign owner"],
                ["convert", "Convert to job"],
                ["approve", "Approve message"],
                ["property", "Link property"],
              ].map(([key, label]) => (
                <Link
                  className={`inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-semibold transition active:-translate-y-px ${
                    action === key
                      ? "border-[#151515] bg-[#151515] text-white"
                      : "border-[#ddd6cd] bg-white text-[#151515] hover:border-[#151515]"
                  }`}
                  href={`${crmObject.href}/${record.id}?action=${key}`}
                  key={key}
                >
                  {label}
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
  const crmObject = crmObjects.find((object) => object.key === objectKey);
  return crmObject?.sampleRows.map((record) => ({ recordId: record.id })) ?? [];
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
