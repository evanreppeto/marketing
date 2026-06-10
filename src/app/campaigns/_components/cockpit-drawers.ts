export const DRAWER_KEYS = [
  "reasoning",
  "approvals",
  "performance",
  "audit",
  "dispatch",
  "media",
  "economics",
  "brief",
] as const;

export type DrawerKey = (typeof DRAWER_KEYS)[number];

export function isDrawerKey(value: string | null | undefined): value is DrawerKey {
  return value != null && (DRAWER_KEYS as readonly string[]).includes(value);
}

/** A bare `?item=` (shared Decision-log link) opens the approvals drawer; an
 *  explicit valid `?drawer=` wins; otherwise no drawer. */
export function drawerForUrl({ drawer, item }: { drawer: string | null; item: string | null }): DrawerKey | null {
  if (isDrawerKey(drawer)) return drawer;
  if (item) return "approvals";
  return null;
}
