import { type MediaFolderView } from "@/lib/media-library/types";

export function FolderRail({ folders }: { folders: MediaFolderView[] }) {
  return (
    <nav className="w-[200px] shrink-0 space-y-1">
      {folders.map((f) => (
        <div
          key={f.id}
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
        >
          <span className="truncate">{f.name}</span>
          <span className="text-xs text-[var(--text-muted)]">{f.count}</span>
        </div>
      ))}
    </nav>
  );
}
