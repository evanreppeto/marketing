import { type VaultNote } from "@/domain";

// Intentionally empty: the vault starts blank and fills with real notes that
// Mark (or the operator) writes through the wired persistence layer. Notes use
// the same raw Obsidian format ([[wiki-links]], frontmatter), so a future vault
// import stays drop-in. This array remains only as the offline fallback shape.
export const seedVaultNotes: VaultNote[] = [];
