import { connection } from "next/server";

import { EmptyState, PageHeader } from "@/app/_components/page-header";
import { formatByteSize } from "@/domain";
import { getMediaLibraryData } from "@/lib/media-library/read-model";

import { AssetGrid } from "./_components/asset-grid";
import { FolderRail } from "./_components/folder-rail";

export default async function LibraryPage() {
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

  return (
    <>
      <PageHeader
        title="Library"
        description={`${data.assets.length} assets · ${formatByteSize(data.totalBytes)} · upload media and hand it to your agent.`}
      />
      {data.assets.length === 0 ? (
        <EmptyState title="No media yet" detail="Upload photos, video, or logos and they'll appear here." />
      ) : (
        <div className="flex gap-5">
          <FolderRail folders={data.folders} />
          <AssetGrid assets={data.assets} />
        </div>
      )}
    </>
  );
}
