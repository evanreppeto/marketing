import { OFFICIAL_PERSONA_MAPPINGS, type LinkResolutionContext, type VaultNote } from "@/domain";

import { crmObjects } from "@/app/_data/growth-engine";
import { seedVaultNotes } from "@/lib/vault/seed-notes";

export const vaultNotes = seedVaultNotes;

export const vaultCollections = [
  { folder: "Playbooks", description: "Repeatable plays for converting and growing accounts." },
  { folder: "Partner Intel", description: "What we know about referral partners and trade allies." },
  { folder: "Persona Docs", description: "How each restoration persona thinks, decides, and converts." },
  { folder: "SOPs", description: "Operating procedures and guardrails the team follows." },
  { folder: "Field Notes", description: "Dated observations from jobs, calls, and the field." },
];

// Build the resolution context from live app data so wiki-links can point at
// real CRM records and personas, not just other notes. Pass the active notes
// (from Supabase or the seeds) so note-to-note links resolve correctly.
export function buildLinkContext(notes: VaultNote[] = vaultNotes): LinkResolutionContext {
  const noteMap = new Map(notes.map((n) => [n.slug, `/vault/${n.slug}`]));

  const recordMap = new Map<string, string>();
  for (const object of crmObjects) {
    for (const row of object.sampleRows) {
      recordMap.set(row.id, `${object.href}/${row.id}`);
    }
  }

  const personaMap = new Map<string, string>(
    OFFICIAL_PERSONA_MAPPINGS.map((persona) => [persona, "/persona-intelligence"]),
  );

  return { notes: noteMap, records: recordMap, personas: personaMap };
}
