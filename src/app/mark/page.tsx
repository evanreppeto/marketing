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
  const [conversations, mentionGroups] = await Promise.all([listConversations(operator), getMentionables()]);

  const requestedId = valueOf(params?.c);
  const activeId = requestedId || conversations[0]?.id || "";
  const activeConversation = activeId ? await getConversation(activeId) : null;
  const initialMessages = activeConversation ? await listMessages(activeConversation.id) : [];

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
