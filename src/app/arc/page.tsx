import { connection } from "next/server";
import type { ComponentProps } from "react";

import { countActiveApprovals } from "@/lib/approvals/read-model";
import { countPendingOpportunities } from "@/lib/opportunities/read-model";
import { getOperatorActor } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getMentionables } from "@/lib/arc-chat/mention-search";
import {
  listConversations,
  listMessages,
  getConversation,
  listProjects,
  listArchivedConversations,
  listProjectAssetMessages,
  type ArcConversation,
  type ArcMessage,
} from "@/lib/arc-chat/persistence";
import { listCampaignNames } from "@/lib/campaigns/read-model";
import { getAppSettings } from "@/lib/settings/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { ArcChat } from "./_components/arc-chat";
import { SLASH_COMMANDS } from "./_components/slash-commands";
import { getDemoChat } from "./_data/demo";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Chat" };

type ArcPageProps = {
  searchParams?: Promise<{ c?: string | string[]; archived?: string | string[]; project?: string | string[]; skill?: string | string[] }>;
};
type ArcChatProps = ComponentProps<typeof ArcChat>;
const ARC_PAGE_DATA_TIMEOUT_MS = 8000;

function valueOf(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

/** "evan.reppeto5928@…" → "Evan"; the unconfigured fallback actor gets no name. */
function displayName(actor: string): string | null {
  if (!actor.includes("@")) return null;
  const first = actor.split("@")[0].split(/[._\-+]/)[0].replace(/\d+/g, "");
  if (!first) return null;
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Arc page data timed out.")), ms);
  });

  try {
    return await Promise.race([work, timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function loadLiveArcChatProps(
  params: Awaited<ArcPageProps["searchParams"]>,
): Promise<{ chatProps: ArcChatProps; pendingOpportunities: number }> {
  const operator = await getOperatorActor();
  // Scope workspace-wide reads (approval count, campaign @-mentions) to the
  // active org; the admin client bypasses RLS so this is the tenant boundary.
  const orgId = await getCurrentOrgId().catch(() => undefined);
  const showArchived = valueOf(params?.archived) === "1";
  const requestedId = valueOf(params?.c);
  const requestedProject = valueOf(params?.project);
  const requestedSkill = valueOf(params?.skill);

  // These reads are independent, so run them concurrently. Previously they were
  // ~8 sequential Supabase round-trips that summed past the page-data timeout and
  // silently degraded the whole chat to demo mode; one parallel batch stays well
  // under budget. Optional reads (approvals, campaigns) self-recover to a default.
  const [
    mentionGroups,
    settings,
    pendingApprovals,
    conversations,
    projects,
    campaigns,
    archived,
    activeConversation,
    pendingOpportunities,
  ] = await Promise.all([
    getMentionables(),
    getAppSettings(),
    countActiveApprovals(orgId).catch(() => 0),
    listConversations(operator),
    listProjects(operator),
    listCampaignNames(orgId)
      .then((list) => list.map((c) => ({ id: c.id, name: c.name })))
      .catch(() => [] as { id: string; name: string }[]),
    showArchived ? listArchivedConversations(operator) : Promise.resolve([] as ArcConversation[]),
    requestedId ? getConversation(requestedId) : Promise.resolve(null),
    countPendingOpportunities().catch(() => 0),
  ]);

  // "New chat in this project" deep link (?project=<id>) — only meaningful for a
  // fresh chat; ignored once a thread is active and validated against real projects.
  const newChatProjectId =
    !activeConversation && requestedProject && projects.some((p) => p.id === requestedProject)
      ? requestedProject
      : null;

  // Skills-launcher deep link (?skill=<id>) — only for a fresh chat, validated
  // against the known commands so a bad param is ignored.
  const initialSkill =
    !activeConversation && requestedSkill && SLASH_COMMANDS.some((c) => c.cmd.slice(1) === requestedSkill)
      ? requestedSkill
      : null;

  // Dependent reads (need the resolved active conversation / project). Also
  // concurrent. Project assets feed the Studio for an active thread and the
  // empty-state hero for a fresh chat opened via the ?project=<id> deep link.
  const assetProjectId = activeConversation?.projectId ?? newChatProjectId;
  const [initialMessages, projectMessages] = await Promise.all([
    activeConversation ? listMessages(activeConversation.id) : Promise.resolve([] as ArcMessage[]),
    assetProjectId
      ? listProjectAssetMessages(
          assetProjectId,
          operator,
          activeConversation ? { excludeConversationId: activeConversation.id } : {},
        ).catch(() => [] as ArcMessage[])
      : Promise.resolve([] as ArcMessage[]),
  ]);

  return {
    chatProps: {
      conversations,
      projects,
      archived,
      showArchived,
      activeId: activeConversation?.id ?? "",
      activeTitle: activeConversation?.title ?? "",
      activeProjectId: activeConversation?.projectId ?? null,
      newChatProjectId,
      initialSkill,
      activeCampaignId: activeConversation?.campaignId ?? null,
      campaigns,
      activePinned: Boolean(activeConversation?.pinnedAt),
      initialMessages,
      projectMessages,
      mentionGroups,
      operatorName: displayName(operator),
      pendingApprovals,
      defaultMode: settings.markDefaultMode,
      defaultRoute: settings.markDefaultRoute,
      assistantName: settings.assistantName,
    },
    pendingOpportunities,
  };
}

export default async function ArcPage({ searchParams }: ArcPageProps) {
  await connection();

  // Preview mode: when Supabase isn't configured, render the full chat with sample
  // data instead of an empty state, so the whole experience is visible without backend.
  if (!isSupabaseAdminConfigured()) {
    const demoParams = await searchParams;
    const demoSkill = valueOf(demoParams?.skill);
    const initialSkill = demoSkill && SLASH_COMMANDS.some((c) => c.cmd.slice(1) === demoSkill) ? demoSkill : null;
    // A Skills-launcher click opens a fresh chat, so in preview surface the empty
    // state (not the seeded thread) and let the composer pre-apply the command.
    const freshForSkill: Partial<ArcChatProps> = initialSkill
      ? { activeId: "", activeTitle: "", activeProjectId: null, activeCampaignId: null, activePinned: false, initialMessages: [] }
      : {};
    return <ArcChat {...getDemoChat()} {...freshForSkill} demo initialSkill={initialSkill} />;
  }

  const params = await searchParams;
  let markChatProps: ArcChatProps;
  let pendingOpportunities = 0;
  let demo = false;
  try {
    const live = await withTimeout(loadLiveArcChatProps(params), ARC_PAGE_DATA_TIMEOUT_MS);
    markChatProps = live.chatProps;
    pendingOpportunities = live.pendingOpportunities;
  } catch (err) {
    // Supabase may be paused, unreachable, or missing migrations. Keep the app
    // open with the full preview instead of making Vercel wait on backend reads.
    // Log it — a silent fallback here is what made a slow-load regression look
    // like "every chat feature is broken" instead of a visible error.
    console.error("[mark] live data load failed; falling back to demo preview:", err);
    markChatProps = getDemoChat();
    demo = true;
  }

  return <ArcChat {...markChatProps} demo={demo} pendingOpportunities={pendingOpportunities} />;
}
