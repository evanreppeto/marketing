import { notFound } from "next/navigation";

import { AppShell } from "../../_components/app-shell";
import { ActionFeedback, EmptyState, PageHeader } from "../../_components/page-header";
import { CrmRecordForm } from "./crm-record-form";
import { isCrmEntityKey } from "../entity-keys";
import { getCrmRecordData, type CrmObjectKey } from "@/lib/crm/read-model";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { getCampaignsForRecord, type LinkedCampaignRecordKind } from "@/lib/campaigns/read-model";
import { LinkedCampaignsPanel } from "./linked-campaigns-panel";
import { entityTypeFromCrmObjectKey } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getAgentName } from "@/lib/settings/agent-name";
import { getRecordNotes, getRecordTasks, getRecordTimeline } from "@/lib/interactions/read-model";
import { RecordTimeline } from "./record-interactions/timeline";
import { NotesPanel } from "./record-interactions/notes-panel";
import { TasksPanel } from "./record-interactions/tasks-panel";
import {
  ConnectedRecords,
  ContactChannels,
  DataQuality,
  EngagementSummary,
  EvidenceSection,
  NextBestAction,
  PersonaIntelligence,
  RecordHeaderBand,
  RecordQuickStats,
  RelationshipGraph,
  StoredFields,
} from "./crm-record-detail";

const RECORD_FEEDBACK = [
  "created",
  "updated",
  "crm-error",
  "not-configured",
  "note-added",
  "note-updated",
  "note-error",
  "task-created",
  "task-completed",
  "task-error",
  "activity-logged",
  "activity-error",
];

type CrmRecordPageProps = {
  action?: string;
  tab?: string;
  objectKey: CrmObjectKey;
  recordId: string;
};


export async function CrmRecordPage({ action, tab, objectKey, recordId }: CrmRecordPageProps) {
  // Demo fallback records (rendered when Supabase is unconfigured/empty) use
  // stable string ids like "demo-ld-northside-referral" rather than UUIDs. Let
  // those through so the read-model can resolve them; genuinely unknown ids
  // still return not_found below.
  if (!isUuid(recordId) && !recordId.startsWith("demo-")) {
    notFound();
  }

  const agentName = await getAgentName();
  const recordResult = await getCrmRecordData(objectKey, recordId, undefined, agentName);

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
  const entityType = entityTypeFromCrmObjectKey(objectKey);
  let timeline: Awaited<ReturnType<typeof getRecordTimeline>> | null = null;
  let notes: Awaited<ReturnType<typeof getRecordNotes>> | null = null;
  let tasks: Awaited<ReturnType<typeof getRecordTasks>> | null = null;
  if (entityType && isSupabaseAdminConfigured()) {
    const orgId = await getCurrentOrgId();
    [timeline, notes, tasks] = await Promise.all([
      getRecordTimeline(entityType, recordId, orgId),
      getRecordNotes(entityType, recordId, orgId),
      getRecordTasks(entityType, recordId, orgId),
    ]);
  }
  const showEditForm = action === "edit" && isCrmEntityKey(objectKey);
  const feedbackAction = RECORD_FEEDBACK.includes(action ?? "") ? action : undefined;
  let editValues: Record<string, unknown> | undefined;

  if (showEditForm && isSupabaseAdminConfigured()) {
    const orgId = await getCurrentOrgId();
    const { data } = await getSupabaseAdminClient()
      .from(objectKey)
      .select("*")
      .eq("id", recordId)
      .eq("org_id", orgId)
      .maybeSingle();
    editValues = (data as Record<string, unknown> | null) ?? undefined;
  }

  return (
    <AppShell active="/crm">
      <PageHeader
        backHref={`/crm/${record.key}`}
        backLabel={record.label}
        eyebrow="CRM"
        title={`${record.label} record`}
      />

      <ActionFeedback
        action={feedbackAction}
        messages={{
          created: `${record.label} record created.`,
          updated: "Changes saved.",
          "crm-error": "That change could not be saved. Check the fields and try again.",
          "not-configured": "Supabase is not connected, so nothing was written.",
          "note-added": "Note added.",
          "note-updated": "Note updated.",
          "note-error": "That note could not be saved.",
          "task-created": "Task created.",
          "task-completed": "Task marked complete.",
          "task-error": "That task could not be saved.",
          "activity-logged": "Activity logged.",
          "activity-error": "That activity could not be logged.",
        }}
      />

      <div className="space-y-5">
        <RecordHeaderBand record={record} />

        {showEditForm && isCrmEntityKey(objectKey) ? (
          <CrmRecordForm objectKey={objectKey} mode="edit" recordId={recordId} values={editValues} />
        ) : null}

        <RecordQuickStats stats={record.quickStats} />

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* Intelligence rail — rendered first in source so it leads the page on
             narrow viewports, and sticks to the top on wide ones. */}
          <aside className="min-w-0 space-y-5 lg:order-2 lg:sticky lg:top-5 lg:self-start">
            <NextBestAction record={record} />
            <PersonaIntelligence record={record} />
            <ConnectedRecords record={record} agentName={agentName} />
            <ContactChannels record={record} />
            <LinkedCampaignsPanel campaigns={linkedCampaigns} />
            <DataQuality items={record.dataQuality} recordId={record.id} objectLabel={record.label} />
          </aside>

          <div className="min-w-0 space-y-5 lg:order-1">
            <StoredFields record={record} />
            <EvidenceSection record={record} />
            <EngagementSummary metrics={record.engagement} />
            <RelationshipGraph nodes={record.graph} />
            {entityType ? (
              <>
                {tasks?.status === "live" ? (
                  <TasksPanel entityType={entityType} entityId={recordId} tasks={tasks.tasks} />
                ) : null}
                {notes?.status === "live" ? (
                  <NotesPanel entityType={entityType} entityId={recordId} notes={notes.notes} agentName={agentName} />
                ) : null}
                {timeline?.status === "live" ? <RecordTimeline entries={timeline.entries} /> : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export function getCrmRecordParams(objectKey: CrmObjectKey) {
  void objectKey;
  return [];
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
