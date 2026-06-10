import { OFFICIAL_PERSONA_MAPPINGS, type LinkResolutionContext, type VaultNote } from "@/domain";

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
// real personas and other notes. Record links resolve only against real CRM
// rows (none are mapped statically); unresolved targets render as plain text.
export function buildLinkContext(notes: VaultNote[] = vaultNotes): LinkResolutionContext {
  const noteMap = new Map(notes.map((n) => [n.slug, `/vault/${n.slug}`]));

  const personaMap = new Map<string, string>(
    OFFICIAL_PERSONA_MAPPINGS.map((persona) => [persona, "/persona-intelligence"]),
  );

  return { notes: noteMap, records: new Map<string, string>(), personas: personaMap };
}

export type StatusTone = "amber" | "green" | "red" | "gray" | "blue" | "dark";
export type CollectionIcon = "play" | "handshake" | "user" | "shield" | "note";

export const collectionThemes: Record<string, { tone: StatusTone; icon: CollectionIcon }> = {
  Playbooks: { tone: "blue", icon: "play" },
  "Partner Intel": { tone: "green", icon: "handshake" },
  "Persona Docs": { tone: "amber", icon: "user" },
  SOPs: { tone: "red", icon: "shield" },
  "Field Notes": { tone: "gray", icon: "note" },
};

export const DEFAULT_COLLECTION_THEME: { tone: StatusTone; icon: CollectionIcon } = { tone: "gray", icon: "note" };

export function collectionTheme(folder: string) {
  return collectionThemes[folder] ?? DEFAULT_COLLECTION_THEME;
}
