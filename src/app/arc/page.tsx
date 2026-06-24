import { connection } from "next/server";
import type { ComponentProps } from "react";

import { canComposeInThread } from "@/domain";
import { countActiveApprovals } from "@/lib/approvals/read-model";
import { countPendingOpportunities } from "@/lib/opportunities/read-model";
import { getOperatorActor } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getMentionables } from "@/lib/arc-chat/mention-search";
import {
  listConversationsForViewer,
  listMessages,
  getConversation,
  listProjects,
  listArchivedConversations,
  listProjectAssetMessages,
  type ArcConversation,
  type ArcMessage,
} from "@/lib/arc-chat/persistence";
import { getShareViewer, resolveConversationAccessFor, listConversationShares } from "@/lib/arc-chat/sharing";
import { getAppSettings } from "@/lib/settings/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { listWorkspaceTeamAccess } from "@/lib/auth/workspace-invites";

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

/** Workspace member roster for the share-with picker — guarded so a missing
 *  workspace or unconfigured Supabase degrades to an empty list, not a throw. */
async function loadShareMembers(): Promise<{ userId: string; label: string }[]> {
  try {
    const workspaceId = await getCurrentWorkspaceContext()
      .then((ctx) => ctx.workspaceId)
      .catch(() => null);
    if (!workspaceId) return [];
    const roster = await listWorkspaceTeamAccess(workspaceId);
    if (!roster.ok) return [];
    return roster.members
      .filter((m) => m.status === "active" && m.userId != null)
      .map((m) => ({ userId: m.userId as string, label: m.email ?? m.role }));
  } catch {
    return [];
  }
}

async function loadLiveArcChatProps(
  params: Awaited<ArcPageProps["searchParams"]>,
): Promise<{ chatProps: ArcChatProps; pendingOpportunities: number }> {
  // Operator, org, and viewer are independent identity/tenancy reads — resolve
  // them in one round-trip batch instead of three sequential awaits, which is
  // latency the user paid on every single thread navigation. Scope workspace-wide
  // reads (approval count, campaign @-mentions) to the active org; the admin
  // client bypasses RLS so this is the tenant boundary. The viewer resolves
  // sharing enforcement (open/dev mode returns enforce:false → no-op).
  const [operator, orgId, viewer] = await Promise.all([
    getOperatorActor(),
    getCurrentOrgId().catch(() => undefined),
    getShareViewer(),
  ]);
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
    archived,
    requestedConversation,
    pendingOpportunities,
  ] = await Promise.all([
    getMentionables(),
    getAppSettings(),
    countActiveApprovals(orgId).catch(() => 0),
    listConversationsForViewer(viewer, operator),
    listProjects(operator),
    showArchived ? listArchivedConversations(operator) : Promise.resolve([] as ArcConversation[]),
    requestedId ? getConversation(requestedId) : Promise.resolve(null),
    countPendingOpportunities().catch(() => 0),
  ]);

  // Reuse the campaign names already loaded for @-mentions instead of issuing a
  // second identical `listCampaignNames` query — the mention catalog and the
  // campaign picker want the same id/name list. (getMentionables drops empty
  // groups, so a workspace with no campaigns yields [], matching the old default.)
  const campaigns = (mentionGroups.find((g) => g.type === "campaign")?.items ?? []).map((item) => ({
    id: item.id,
    name: item.label,
  }));

  // Resolve the requested thread's access ONCE: this both gates visibility and
  // derives the composer permission. It reuses the conversation row already
  // fetched above (resolveConversationAccessFor) instead of re-reading it, so a
  // thread open costs one fewer round-trip. The gate runs before the dependent
  // message reads below, so messages are never loaded for a thread the viewer
  // can't access. In open/dev mode enforce is false → full access.
  const activeAccess = requestedConversation
    ? await resolveConversationAccessFor(requestedConversation, viewer)
    : null;
  const activeConversation = activeAccess?.canView ? requestedConversation : null;
  // A fresh chat (the /arc landing page, no active conversation) is always
  // composable — the viewer owns the chat they're about to create. Without this
  // guard, enforced sharing collapsed the landing-page composer to a "View-only
  // — shared by the owner" notice, which is the bug operators hit every visit.
  const canCompose = canComposeInThread({
    enforce: viewer.enforce,
    hasActiveConversation: Boolean(activeConversation),
    activePermission: activeAccess?.permission ?? null,
  });

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

  // Dependent reads (need the resolved active conversation / project). All four
  // are concurrent — none depends on another's result, so they cost one round-trip
  // batch instead of the three sequential phases this used to be (messages →
  // members → shares). Project assets feed the Studio for an active thread and the
  // empty-state hero for a fresh chat opened via the ?project=<id> deep link.
  // Share data (member roster + current shares) only drives the header Share
  // control, which renders for an active conversation only — so it's skipped
  // entirely on the landing page rather than costing reads no one sees.
  const assetProjectId = activeConversation?.projectId ?? newChatProjectId;
  const [initialMessages, projectMessages, shareMembers, conversationShares] = await Promise.all([
    activeConversation ? listMessages(activeConversation.id) : Promise.resolve([] as ArcMessage[]),
    assetProjectId
      ? listProjectAssetMessages(
          assetProjectId,
          operator,
          activeConversation ? { excludeConversationId: activeConversation.id } : {},
        ).catch(() => [] as ArcMessage[])
      : Promise.resolve([] as ArcMessage[]),
    activeConversation ? loadShareMembers() : Promise.resolve([] as { userId: string; label: string }[]),
    activeConversation
      ? listConversationShares(activeConversation.id).catch(() => [])
      : Promise.resolve([] as { userId: string; permission: "view" | "collaborate" }[]),
  ]);

  return {
    chatProps: {
      conversations,
      projects,
      archived,
      showArchived,
      canCompose,
      shareMembers,
      conversationShares,
      activeVisibility: activeConversation?.visibility ?? "private",
      activeWorkspacePermission: activeConversation?.workspacePermission ?? "view",
      viewerUserId: viewer.userId,
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
  const demo = false;
  let dataUnavailable = false;
  try {
    const live = await withTimeout(loadLiveArcChatProps(params), ARC_PAGE_DATA_TIMEOUT_MS);
    markChatProps = live.chatProps;
    pendingOpportunities = live.pendingOpportunities;
  } catch (err) {
    // Supabase IS configured but the live read failed/timed out (paused DB,
    // transient error, missing migration). Do NOT fabricate sample records as
    // if real — that "demo masks features" trap let an incident look like a
    // working workspace. Render an empty, honest shell with a "couldn't load —
    // retry" banner; the composer stays in real mode so a send surfaces a
    // retryable failed bubble instead of a fake reply. Keep the app open (don't
    // make Vercel wait on backend reads) and log the cause.
    console.error("[arc] live data load failed; rendering empty shell with a load-error banner:", err);
    markChatProps = {
      ...getDemoChat(),
      conversations: [],
      projects: [],
      archived: [],
      showArchived: false,
      activeId: "",
      activeTitle: "",
      activeProjectId: null,
      activeCampaignId: null,
      campaigns: [],
      activePinned: false,
      initialMessages: [],
      // Strip the remaining demo CONSTANTS so the "honest empty shell" carries no
      // fabricated data during an outage: the demo @-mention catalog (fake CRM /
      // campaign records), the seeded approval count, and the demo operator name.
      mentionGroups: [],
      pendingApprovals: 0,
      operatorName: null,
    };
    dataUnavailable = true;
  }

  return (
    <ArcChat
      {...markChatProps}
      demo={demo}
      dataUnavailable={dataUnavailable}
      pendingOpportunities={pendingOpportunities}
    />
  );
}
