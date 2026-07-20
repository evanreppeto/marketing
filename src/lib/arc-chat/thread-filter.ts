import type { ArcThreadGroupVM } from "./read-model";

export type ArcThreadFilter = "all" | "running" | "pinned";

export function filterThreadGroups(
  groups: ArcThreadGroupVM[],
  query: string,
  filter: ArcThreadFilter = "all",
): ArcThreadGroupVM[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery && filter === "all") return groups;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((thread) => {
        const matchesQuery = !normalizedQuery
          || `${thread.title} ${thread.when} ${group.group}`.toLocaleLowerCase().includes(normalizedQuery);
        const matchesFilter = filter === "all"
          || (filter === "running" && thread.running)
          || (filter === "pinned" && thread.pinned);
        return matchesQuery && matchesFilter;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
