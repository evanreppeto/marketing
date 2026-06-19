import { connection } from "next/server";

import { EmptyState, PageHeader } from "@/app/_components/page-header";
import { formatByteSize } from "@/domain";
import { getMediaLibraryData } from "@/lib/media-library/read-model";

import { AssetGrid } from "./_components/asset-grid";
import { FolderRail } from "./_components/folder-rail";
import { GoogleDriveImport } from "./_components/google-drive-import";
import { NewFolderButton } from "./_components/new-folder-button";
import { UploadButton } from "./_components/upload-button";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string | string[] }>;
}) {
  await connection();
  const data = await getMediaLibraryData();

  if (data.status === "unavailable") {
    return (
      <>
        <PageHeader title="Library" description={data.message} />
        <EmptyState title="Library unavailable" detail={data.message} />
      </>
    );
  }

  const folderParam = (await searchParams).folder;
  const activeFolderId = (Array.isArray(folderParam) ? folderParam[0] : folderParam) ?? "all";
  const isFolderActive = activeFolderId !== "all" && data.folders.some((f) => f.id === activeFolderId);
  const visibleAssets = isFolderActive
    ? data.assets.filter((a) => a.folderId === activeFolderId)
    : data.assets;
  const arcCount = data.assets.filter((a) => a.availableToArc).length;

  return (
    <>
      <PageHeader
        title="Library"
        description={`${data.assets.length} assets · ${formatByteSize(data.totalBytes)} · ${arcCount} available to Arc.`}
        aside={
          data.assets.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <NewFolderButton />
              <GoogleDriveImport activeFolderId={isFolderActive ? activeFolderId : null} />
              <UploadButton activeFolderId={isFolderActive ? activeFolderId : null} />
            </div>
          ) : undefined
        }
      />
      {data.assets.length === 0 ? (
        <EmptyState
          title="No media yet"
          detail="Upload photos, video, or logos and they'll appear here."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <GoogleDriveImport activeFolderId={null} />
              <UploadButton activeFolderId={null} />
            </div>
          }
        />
      ) : (
        <div className="flex gap-5">
          <FolderRail folders={data.folders} activeFolderId={isFolderActive ? activeFolderId : "all"} />
          <AssetGrid assets={visibleAssets} folders={data.folders} />
        </div>
      )}
    </>
  );
}
