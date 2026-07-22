export const ARC_RECALL_PREVIEW_LIMIT = 3;

export function visibleRecallCount(total: number, expanded: boolean) {
  return expanded ? total : Math.min(total, ARC_RECALL_PREVIEW_LIMIT);
}
