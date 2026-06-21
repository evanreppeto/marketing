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
  searchParams: Promise<{ detail?: string | string[]; folder?: string | string[]; googleDrive?: string | string[] }>;
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

  const params = await searchParams;
  const folderParam = params.folder;
  const driveStatus = firstParam(params.googleDrive);
  const driveDetail = firstParam(params.detail);
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
              <GoogleDriveImport
                activeFolderId={isFolderActive ? activeFolderId : null}
                defaultOpen={driveStatus === "connected"}
                initialMessage={driveStatus === "connected" ? "Google Drive connected. Choose files to import." : null}
              />
              <UploadButton activeFolderId={isFolderActive ? activeFolderId : null} />
            </div>
          ) : undefined
        }
      />
      <GoogleDriveNotice status={driveStatus} detail={driveDetail} />
      {data.assets.length === 0 ? (
        <EmptyState
          title="No media yet"
          detail="Upload photos, video, or logos and they'll appear here."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <GoogleDriveImport
                activeFolderId={null}
                defaultOpen={driveStatus === "connected"}
                initialMessage={driveStatus === "connected" ? "Google Drive connected. Choose files to import." : null}
              />
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

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function GoogleDriveNotice({ status, detail }: { status: string | null; detail: string | null }) {
  if (!status) return null;
  const ok = status === "connected";
  const message = ok
    ? "Google Drive connected. Choose files from Drive to copy them into Library."
    : `Google Drive did not connect${detail ? `: ${detail}` : "."}`;

  return (
    <div
      className={`mb-4 rounded-md border px-4 py-3 text-sm font-semibold ${
        ok
          ? "border-[var(--ok-border-soft)] bg-[var(--ok-soft)] text-[var(--ok-text)]"
          : "border-[var(--priority-border-soft)] bg-[var(--priority-soft)] text-[var(--priority-text)]"
      }`}
    >
      {message}
    </div>
  );
}
