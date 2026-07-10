import { type SupabaseClient } from "@supabase/supabase-js";

import { type AudienceResolution, type Contact, ContactSchema, resolveCampaignAudience } from "@/domain";

import { getSupabaseAdminClient } from "@/lib/supabase/server";

const CANDIDATE_CAP = 10_000;

/**
 * Read-only email-audience preview for a campaign: fetch the campaign's targeting
 * + candidate contacts, then run the pure domain resolver. NO dispatch rows, NO
 * send. Returns null when the campaign/backend can't be read. All the resolution
 * rules (suppression via contact_status, address validity, de-dup, reason tags)
 * live in src/domain/audience-resolution.ts — this only does the I/O.
 */
export async function getCampaignAudiencePreview(
  input: { campaignId: string; orgId: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<AudienceResolution | null> {
  const { campaignId, orgId } = input;
  try {
    const { data: campaign, error: campaignError } = await client
      .from("campaigns")
      .select("persona,company_id,contact_id")
      .eq("id", campaignId)
      .eq("org_id", orgId)
      .maybeSingle<{ persona: string; company_id: string | null; contact_id: string | null }>();
    if (campaignError || !campaign?.persona) return null;

    // Candidate set: the 1:1 target contact, else the persona's contacts.
    let query = client.from("contacts").select("*").eq("org_id", orgId);
    query = campaign.contact_id ? query.eq("id", campaign.contact_id) : query.eq("persona", campaign.persona);
    const { data, error } = await query.limit(CANDIDATE_CAP);
    if (error) return null;

    const contacts: Contact[] = [];
    for (const row of data ?? []) {
      const parsed = ContactSchema.safeParse(row);
      if (parsed.success) contacts.push(parsed.data);
    }

    return resolveCampaignAudience(
      { persona: campaign.persona, contactId: campaign.contact_id, companyId: campaign.company_id },
      contacts,
      "email",
    );
  } catch {
    return null;
  }
}
