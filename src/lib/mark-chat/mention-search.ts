import { type MarkMention, type MentionType } from "@/domain";
import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { getCrmObjectData, type CrmObjectKey } from "@/lib/crm/read-model";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { listVaultNotes } from "@/lib/vault/persistence";

export type MentionGroup = {
  type: MentionType;
  label: string;
  items: MarkMention[];
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

  const campaigns: MentionGroup = { type: "campaign", label: "Campaigns", items: [] };
  try {
    const list = await getCampaignWorkspaceList();
    if (list.status === "live") {
      campaigns.items = list.campaigns.map((c) => ({
        type: "campaign" as const,
        id: c.id,
        label: c.name,
        href: c.href,
      }));
    }
  } catch {
    // leave empty
  }

  const crmGroups: MentionGroup[] = [];
  for (const group of CRM_GROUPS) {
    const out: MentionGroup = { type: group.type, label: group.label, items: [] };
    try {
      const data = await getCrmObjectData(group.key);
      if (data.status === "live") {
        out.items = data.sampleRows.map((row) => ({
          type: group.type,
          id: row.id,
          label: row.name,
          href: `/crm/${group.key}/${row.id}`,
        }));
      }
    } catch {
      // leave empty
    }
    crmGroups.push(out);
  }

  const vault: MentionGroup = { type: "vault", label: "Vault notes", items: [] };
  try {
    vault.items = (await listVaultNotes(client)).map((note) => ({
      type: "vault" as const,
      id: note.slug,
      label: note.title,
      href: `/vault/${note.slug}`,
    }));
  } catch {
    // leave empty
  }

  return [campaigns, ...crmGroups, personas, vault].filter((g) => g.items.length > 0);
}
