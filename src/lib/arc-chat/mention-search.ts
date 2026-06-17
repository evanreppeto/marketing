import { type ArcMention, type MentionType } from "@/domain";
import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";
import { listCampaignNames } from "@/lib/campaigns/read-model";
import { getCrmMentionSamples, type CrmObjectKey } from "@/lib/crm/read-model";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { listVaultNotes } from "@/lib/vault/persistence";

export type MentionGroup = {
  type: MentionType;
  label: string;
  items: ArcMention[];
};

const CRM_GROUPS: Array<{ key: CrmObjectKey; type: MentionType; label: string }> = [
  { key: "leads", type: "lead", label: "Leads" },
  { key: "companies", type: "company", label: "Companies" },
  { key: "contacts", type: "contact", label: "Contacts" },
  { key: "properties", type: "property", label: "Properties" },
  { key: "jobs", type: "job", label: "Jobs" },
  { key: "outcomes", type: "outcome", label: "Outcomes" },
];

function personaLabel(key: string): string {
  return key
    .replace(/^persona_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Build the full @-mention catalog. Read-only, defensive: any group that fails
 * to load resolves to empty rather than breaking the page. Personas are always
 * available (static); the rest require Supabase.
 */
export async function getMentionables(): Promise<MentionGroup[]> {
  const personas: MentionGroup = {
    type: "persona",
    label: "Personas",
    items: OFFICIAL_PERSONA_MAPPINGS.map((key) => ({
      type: "persona" as const,
      id: key,
      label: personaLabel(key),
      href: `/persona-intelligence?inspect=${key}`,
    })),
  };

  if (!isSupabaseAdminConfigured()) {
    return [personas];
  }

  const client = getSupabaseAdminClient();

  // Campaign names, CRM samples, and vault notes are independent — fetch them
  // concurrently. Each is org-/admin-scoped internally; getCrmMentionSamples does
  // a single table-bundle fetch instead of one per CRM object. Each source
  // self-recovers to empty so one slow/failing read doesn't sink the rest.
  const [campaignRefs, crmSamples, vaultNotes] = await Promise.all([
    listCampaignNames().catch(() => []),
    getCrmMentionSamples().catch(() => ({}) as Awaited<ReturnType<typeof getCrmMentionSamples>>),
    listVaultNotes(client).catch(() => []),
  ]);

  const campaigns: MentionGroup = {
    type: "campaign",
    label: "Campaigns",
    items: campaignRefs.map((c) => ({ type: "campaign" as const, id: c.id, label: c.name, href: c.href })),
  };

  const crmGroups: MentionGroup[] = CRM_GROUPS.map((group) => ({
    type: group.type,
    label: group.label,
    items: (crmSamples[group.key] ?? []).map((row) => ({
      type: group.type,
      id: row.id,
      label: row.name,
      href: `/crm/${group.key}/${row.id}`,
    })),
  }));

  const vault: MentionGroup = {
    type: "vault",
    label: "Vault notes",
    items: vaultNotes.map((note) => ({
      type: "vault" as const,
      id: note.slug,
      label: note.title,
      href: `/vault/${note.slug}`,
    })),
  };

  return [campaigns, ...crmGroups, personas, vault].filter((g) => g.items.length > 0);
}
