import { connection } from "next/server";

import { PageHeader, EmptyState } from "../_components/page-header";
import { getOperatorActor } from "@/lib/auth/operator";
import { getMentionables } from "@/lib/mark-chat/mention-search";
import { listConversations, listMessages, getConversation } from "@/lib/mark-chat/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { MarkChat } from "./_components/mark-chat";

type MarkPageProps = {
  searchParams?: Promise<{ c?: string | string[] }>;
};

function valueOf(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

export default async function MarkPage({ searchParams }: MarkPageProps) {
  await connection();

  if (!isSupabaseAdminConfigured()) {
    return (
      <>
        <PageHeader
          eyebrow="Mark"
          title="Talk to Mark"
          description="Ask Mark about a campaign, a lead, or a persona. Mark drafts and recommends; outbound stays locked."
        />
        <EmptyState
          title="Connect Supabase to chat with Mark"
          detail="Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable conversations. Until then this is a preview."
        />
      </>
    );
  }

  const params = await searchParams;
  const operator = getOperatorActor();
  const mentionGroups = await getMentionables();

  // Supabase is configured, but the mark_chat tables may not exist yet (migration
  // not applied to this environment). Degrade to a preview instead of 500-ing.
  let conversations;
  let activeConversation = null;
  let initialMessages = [] as Awaited<ReturnType<typeof listMessages>>;
  try {
    conversations = await listConversations(operator);
    const requestedId = valueOf(params?.c);
    const activeId = requestedId || conversations[0]?.id || "";
    activeConversation = activeId ? await getConversation(activeId) : null;
    initialMessages = activeConversation ? await listMessages(activeConversation.id) : [];
  } catch {
    return (
      <>
        <PageHeader
          eyebrow="Mark"
          title="Talk to Mark"
          description="Ask Mark about a campaign, a lead, or a persona. Mark drafts and recommends; outbound stays locked."
        />
        <EmptyState
          title="Mark chat isn't initialized yet"
          detail="The conversation tables aren't available. Apply the latest database migration (mark_conversations / mark_messages) to start chatting with Mark."
        />
      </>
    );
  }

  return (
    <MarkChat
      conversations={conversations}
      activeId={activeConversation?.id ?? ""}
      activeTitle={activeConversation?.title ?? ""}
      initialMessages={initialMessages}
      mentionGroups={mentionGroups}
    />
  );
}
