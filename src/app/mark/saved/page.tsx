import { connection } from "next/server";
import Link from "next/link";

import { PageHeader, EmptyState } from "../../_components/page-header";
import { getOperatorActor } from "@/lib/auth/operator";
import { listSavedItems } from "@/lib/mark-chat/saved";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { getAgentName } from "@/lib/settings/agent-name";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { SavedList } from "./_components/saved-list";

export default async function MarkSavedPage() {
  await connection();
  const agentName = await getAgentName();

  if (!isSupabaseAdminConfigured()) {
    return (
      <>
        <PageHeader
          eyebrow={agentName}
          title="Saved"
          description="Items you star in chat live here, ready to promote into a campaign."
          backHref="/mark"
          backLabel="Back to chat"
        />
        <EmptyState
          title="Connect Supabase to save items"
          detail="Saving is disabled until NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
        />
      </>
    );
  }

  const operator = getOperatorActor();
  let items: Awaited<ReturnType<typeof listSavedItems>> = [];
  let campaigns: { id: string; name: string }[] = [];
  try {
    items = await listSavedItems(operator);
  } catch {
    items = [];
  }
  try {
    const list = await getCampaignWorkspaceList();
    campaigns = list.status === "live" ? list.campaigns.map((c) => ({ id: c.id, name: c.name })) : [];
  } catch {
    campaigns = [];
  }

  return (
    <>
      <PageHeader
        eyebrow={agentName}
        title="Saved"
        description="Items you star in chat. Keep experimenting, or promote one into a campaign for approval."
        backHref="/mark"
        backLabel="Back to chat"
      />
      {items.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          detail={`In a chat with ${agentName}, hit the star on a generated image, a draft, or a message to keep it here.`}
        />
      ) : (
        <SavedList items={items} campaigns={campaigns} />
      )}
      <p className="mt-6 text-xs text-[var(--text-muted)]">
        Promoted items land in{" "}
        <Link href="/campaigns" className="text-[var(--accent)] underline">
          Campaigns
        </Link>{" "}
        awaiting approval.
      </p>
    </>
  );
}
