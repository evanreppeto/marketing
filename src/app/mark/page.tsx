import { connection } from "next/server";

import { countActiveApprovals } from "@/lib/approvals/read-model";
import { getOperatorActor } from "@/lib/auth/operator";
import { getMentionables } from "@/lib/mark-chat/mention-search";
import { listConversations, listMessages, getConversation, listProjects, listArchivedConversations } from "@/lib/mark-chat/persistence";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { MarkChat } from "./_components/mark-chat";
import { getDemoChat } from "./_data/demo";

type MarkPageProps = {
  searchParams?: Promise<{ c?: string | string[]; archived?: string | string[] }>;
};

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

export default async function MarkPage({ searchParams }: MarkPageProps) {
  await connection();

  // Preview mode: when Supabase isn't configured, render the full chat with sample
  // data instead of an empty state, so the whole experience is visible without backend.
  if (!isSupabaseAdminConfigured()) {
    return <MarkChat {...getDemoChat()} demo />;
  }

  const params = await searchParams;
  const operator = getOperatorActor();
  const mentionGroups = await getMentionables();

  // Glanceable badge for the work launcher; never fatal if approvals are unavailable.
  let pendingApprovals = 0;
  try {
    pendingApprovals = await countActiveApprovals();
  } catch {
    pendingApprovals = 0;
  }

  // Supabase is configured, but the mark_chat tables may not exist yet (migration
  // not applied to this environment). Degrade to a preview instead of 500-ing.
  const showArchived = valueOf(params?.archived) === "1";
  let conversations;
  let projects = [] as Awaited<ReturnType<typeof listProjects>>;
  let archived = [] as Awaited<ReturnType<typeof listArchivedConversations>>;
  let activeConversation = null;
  let initialMessages = [] as Awaited<ReturnType<typeof listMessages>>;
  let campaigns: { id: string; name: string }[] = [];
  try {
    conversations = await listConversations(operator);
    projects = await listProjects(operator);
    try {
      const list = await getCampaignWorkspaceList();
      campaigns = list.status === "live" ? list.campaigns.map((c) => ({ id: c.id, name: c.name })) : [];
    } catch {
      campaigns = [];
    }
    if (showArchived) archived = await listArchivedConversations(operator);
    // A bare /mark is a fresh "new chat" (blank composer); a thread opens only
    // when explicitly selected via ?c=. Defaulting to the latest thread would
    // make the "New chat" button (which links to /mark) appear to do nothing.
    const requestedId = valueOf(params?.c);
    const activeId = requestedId;
    activeConversation = activeId ? await getConversation(activeId) : null;
    initialMessages = activeConversation ? await listMessages(activeConversation.id) : [];
  } catch {
    // Tables/columns not available (e.g. migration not applied). Fall back to the
    // full preview experience with sample data rather than a dead-end message.
    return <MarkChat {...getDemoChat()} demo />;
  }

  return (
    <MarkChat
      conversations={conversations}
      projects={projects}
      archived={archived}
      showArchived={showArchived}
      activeId={activeConversation?.id ?? ""}
      activeTitle={activeConversation?.title ?? ""}
      activeProjectId={activeConversation?.projectId ?? null}
      activeCampaignId={activeConversation?.campaignId ?? null}
      campaigns={campaigns}
      activePinned={Boolean(activeConversation?.pinnedAt)}
      initialMessages={initialMessages}
      mentionGroups={mentionGroups}
      operatorName={displayName(operator)}
      pendingApprovals={pendingApprovals}
    />
  );
}
