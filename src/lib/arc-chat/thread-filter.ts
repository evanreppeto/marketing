import type { ArcThreadGroupVM } from "./read-model";

export function filterThreadGroups(groups: ArcThreadGroupVM[], query: string): ArcThreadGroupVM[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return groups;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((thread) =>
        `${thread.title} ${thread.when} ${group.group}`.toLocaleLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
