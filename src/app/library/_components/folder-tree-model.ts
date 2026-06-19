import { type MediaAssetView, type MediaFolderView } from "@/lib/media-library/types";

import { folderToneForName } from "./folder-visuals";
import { type FilesystemNode } from "@/components/ui/filesystem-item";

type BuildFilesystemTreeInput = {
  folders: MediaFolderView[];
  assets: MediaAssetView[];
  activeFolderId: string;
};

export function buildFilesystemTree({ folders, assets, activeFolderId }: BuildFilesystemTreeInput): FilesystemNode[] {
  const folderViews = folders.filter((folder) => folder.id !== "all");
  const allFolder = folders.find((folder) => folder.id === "all") ?? {
    id: "all",
    name: "All media",
    parentId: null,
    depth: 0,
    count: assets.length,
    directCount: assets.length,
  };
  const childFolders = new Map<string | null, MediaFolderView[]>();
  const assetsByFolder = new Map<string | null, MediaAssetView[]>();
  const folderById = new Map(folderViews.map((folder) => [folder.id, folder]));

  for (const folder of folderViews) {
    const siblings = childFolders.get(folder.parentId) ?? [];
    siblings.push(folder);
    childFolders.set(folder.parentId, siblings);
  }

  for (const asset of assets) {
    const siblings = assetsByFolder.get(asset.folderId) ?? [];
    siblings.push(asset);
    assetsByFolder.set(asset.folderId, siblings);
  }

  const activePath = new Set<string>(["all"]);
  let cursor = activeFolderId !== "all" ? folderById.get(activeFolderId) : undefined;
  while (cursor) {
    activePath.add(cursor.id);
    cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
  }

  const toFileNode = (asset: MediaAssetView): FilesystemNode => ({
    id: `asset:${asset.id}`,
    kind: "file",
    name: asset.fileName,
    meta: [asset.badge, asset.size].filter(Boolean).join(" · "),
  });

  const toFolderNode = (folder: MediaFolderView): FilesystemNode => {
    const tone = folderToneForName(folder.name);
    const nodes = [...(childFolders.get(folder.id) ?? []).map(toFolderNode), ...(assetsByFolder.get(folder.id) ?? []).map(toFileNode)];

    return {
      id: `folder:${folder.id}`,
      kind: "folder",
      name: folder.name,
      href: `/library?folder=${encodeURIComponent(folder.id)}`,
      count: folder.count,
      directCount: folder.directCount,
      meta: folder.directCount !== folder.count ? `${folder.directCount} here · ${folder.count - folder.directCount} nested` : undefined,
      accent: tone.accent,
      soft: tone.soft,
      border: tone.border,
      isActive: activeFolderId === folder.id,
      defaultOpen: activePath.has(folder.id) || nodes.length > 0,
      nodes,
    };
  };

  const rootTone = folderToneForName(allFolder.name, true);
  const rootNodes = [
    ...(childFolders.get(null) ?? []).map(toFolderNode),
    ...(assetsByFolder.get(null) ?? []).map(toFileNode),
  ];

  return [
    {
      id: "folder:all",
      kind: "folder",
      name: allFolder.name,
      href: "/library",
      count: allFolder.count,
      accent: rootTone.accent,
      soft: rootTone.soft,
      border: rootTone.border,
      isActive: activeFolderId === "all",
      defaultOpen: true,
      nodes: rootNodes,
    },
  ];
}
