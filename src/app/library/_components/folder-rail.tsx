import { FilesystemItem } from "@/components/ui/filesystem-item";
import { type MediaAssetView, type MediaFolderView } from "@/lib/media-library/types";

import { buildFilesystemTree } from "./folder-tree-model";

/**
 * Folder navigation. Filtering is kept server-side: each folder is a Link that
 * sets ?folder=<id> (the "all" folder links to /library with no param).
 * page.tsx reads the param, filters the asset list, and passes the active id
 * back here for highlighting. Nested folders are rendered expanded so uploaded
 * image sets stay visible without another client-side state island.
 */
export function FolderRail({
  folders,
  assets,
  activeFolderId,
}: {
  folders: MediaFolderView[];
  assets: MediaAssetView[];
  activeFolderId: string;
}) {
  const nodes = buildFilesystemTree({ folders, assets, activeFolderId });

  return (
    <nav className="w-[300px] shrink-0 border-r border-[var(--border-hairline)] pr-5">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          File tree
        </div>
        <div className="rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
          {Math.max(0, folders.length - 1)} folders
        </div>
      </div>
      <ul className="space-y-1">
        {nodes.map((node) => (
          <FilesystemItem animated key={`${node.id}:${activeFolderId}`} node={node} />
        ))}
      </ul>
    </nav>
  );
}
