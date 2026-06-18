import Link from "next/link";

import { cx } from "@/app/_components/theme";
import { type MediaFolderView } from "@/lib/media-library/types";

import { FolderIcon } from "./icons";

/**
 * Folder navigation. Filtering is kept server-side: each folder is a Link that
 * sets ?folder=<id> (the "all" folder links to /library with no param).
 * page.tsx reads the param, filters the asset list, and passes the active id
 * back here for highlighting.
 */
export function FolderRail({
  folders,
  activeFolderId,
}: {
  folders: MediaFolderView[];
  activeFolderId: string;
}) {
  return (
    <nav className="w-[200px] shrink-0 space-y-1">
      <div className="px-2 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Folders
      </div>
      {folders.map((f) => {
        const isActive = f.id === activeFolderId;
        return (
          <Link
            key={f.id}
            href={f.id === "all" ? "/library" : `/library?folder=${encodeURIComponent(f.id)}`}
            aria-current={isActive ? "page" : undefined}
            className={cx(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
              isActive
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
            )}
          >
            <FolderIcon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{f.name}</span>
            <span className="text-xs text-[var(--text-muted)]">{f.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}
