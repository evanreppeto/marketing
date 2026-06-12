import { connection } from "next/server";
import type { ComponentProps } from "react";

import { countActiveApprovals } from "@/lib/approvals/read-model";
import { getOperatorActor } from "@/lib/auth/operator";
import { getMentionables } from "@/lib/mark-chat/mention-search";
import {
  listConversations,
  listMessages,
  getConversation,
  listProjects,
  listArchivedConversations,
  listProjectAssetMessages,
  type MarkMessage,
} from "@/lib/mark-chat/persistence";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { getAppSettings } from "@/lib/settings/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { MarkChat } from "./_components/mark-chat";
import { getDemoChat } from "./_data/demo";

type MarkPageProps = {
  searchParams?: Promise<{ c?: string | string[]; archived?: string | string[] }>;
};
type MarkChatProps = ComponentProps<typeof MarkChat>;
const MARK_PAGE_DATA_TIMEOUT_MS = 3000;

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
    timeout = setTimeout(() => reject(new Error("Mark page data timed out.")), ms);
  });

  try {
    return await Promise.race([work, timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function loadLiveMarkChatProps(params: Awaited<MarkPageProps["searchParams"]>): Promise<MarkChatProps> {
  const operator = getOperatorActor();
  const mentionGroups = await getMentionables();
  const settings = await getAppSettings();

  // Glanceable badge for the work launcher; never fatal if approvals are unavailable.
  let pendingApprovals = 0;
  try {
    pendingApprovals = await countActiveApprovals();
  } catch {
    pendingApprovals = 0;
  }

  const showArchived = valueOf(params?.archived) === "1";
  const conversations = await listConversations(operator);
  const projects = await listProjects(operator);
  let campaigns: { id: string; name: string }[] = [];
  try {
    const list = await getCampaignWorkspaceList();
    campaigns = list.status === "live" ? list.campaigns.map((c) => ({ id: c.id, name: c.name })) : [];
  } catch {
    campaigns = [];
  }
  const archived = showArchived ? await listArchivedConversations(operator) : [];
  const requestedId = valueOf(params?.c);
  const activeConversation = requestedId ? await getConversation(requestedId) : null;
  const initialMessages = activeConversation ? await listMessages(activeConversation.id) : [];

  // Project-wide assets for the Studio: asset-bearing messages from sibling chats
  // in the same project. Non-fatal — the chat still works if this read fails.
  let projectMessages: MarkMessage[] = [];
  if (activeConversation?.projectId) {
    try {
      projectMessages = await listProjectAssetMessages(activeConversation.projectId, operator, {
        excludeConversationId: activeConversation.id,
      });
    } catch {
      projectMessages = [];
    }
  }

  return {
    conversations,
    projects,
    archived,
    showArchived,
    activeId: activeConversation?.id ?? "",
    activeTitle: activeConversation?.title ?? "",
    activeProjectId: activeConversation?.projectId ?? null,
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
  };
}

export default async function MarkPage({ searchParams }: MarkPageProps) {
  await connection();

  // Preview mode: when Supabase isn't configured, render the full chat with sample
  // data instead of an empty state, so the whole experience is visible without backend.
  if (!isSupabaseAdminConfigured()) {
    return <MarkChat {...getDemoChat()} demo />;
  }

  const params = await searchParams;
  try {
    return <MarkChat {...(await withTimeout(loadLiveMarkChatProps(params), MARK_PAGE_DATA_TIMEOUT_MS))} />;
  } catch {
    // Supabase may be paused, unreachable, or missing migrations. Keep the app
    // open with the full preview instead of making Vercel wait on backend reads.
    return <MarkChat {...getDemoChat()} demo />;
  }
}
