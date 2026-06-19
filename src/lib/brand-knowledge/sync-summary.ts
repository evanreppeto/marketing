export type BrandKnowledgeSyncTotals = {
  sources: number;
  created: number;
  skipped: number;
  updatedProfiles: number;
  errors: string[];
};

export type BrandKnowledgeSyncSummary = {
  ok: boolean;
  message: string;
  items: string[];
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

export function summarizeBrandKnowledgeSync(totals: BrandKnowledgeSyncTotals): BrandKnowledgeSyncSummary {
  if (totals.sources === 0) {
    return {
      ok: false,
      message: "No brand files found yet.",
      items: ["Upload brand guides, proof, offerings, rules, or Drive files first"],
    };
  }

  const items: string[] = [];
  if (totals.updatedProfiles > 0) items.push("Updated brand details from parsed files");
  if (totals.created > 0) items.push(`Created ${plural(totals.created, "Brain note")} for review`);
  if (totals.skipped > 0) items.push(`Skipped ${plural(totals.skipped, "note")} already in Brain`);
  if (totals.errors.length > 0) items.push(`${plural(totals.errors.length, "file")} needs another try`);
  if (items.length === 0) items.push("No new brand details found");

  return {
    ok: totals.errors.length === 0,
    message: `Brand updated from ${plural(totals.sources, "file")}.`,
    items,
  };
}
