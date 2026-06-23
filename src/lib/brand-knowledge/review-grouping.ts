import type { SourceControlAsset, SourceControlReviewItem } from "./source-control";

/**
 * Pure review-grouping helper. Kept in its own module (no I/O, no server-only
 * imports) so client components can import the function without pulling in
 * source-control.ts's server-only dependencies (auth, Supabase, Google Drive).
 */
export type ReviewSourceGroup = {
  sourceLabel: string;
  sourceProvider: SourceControlAsset["provider"];
  items: SourceControlReviewItem[];
  count: number;
};

/** Group proposed review items by the document they were extracted from,
 * preserving first-seen order so the newest upload's facts stay together. */
export function groupReviewItemsBySource(items: SourceControlReviewItem[]): ReviewSourceGroup[] {
  const groups = new Map<string, ReviewSourceGroup>();
  for (const item of items) {
    const existing = groups.get(item.sourceLabel);
    if (existing) {
      existing.items.push(item);
      existing.count += 1;
    } else {
      groups.set(item.sourceLabel, {
        sourceLabel: item.sourceLabel,
        sourceProvider: item.sourceProvider,
        items: [item],
        count: 1,
      });
    }
  }
  return [...groups.values()];
}
