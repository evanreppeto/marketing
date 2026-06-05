import { connection } from "next/server";

import { EmptyState, PageHeader } from "@/app/_components/page-header";
import { getGalleryData } from "@/lib/gallery/read-model";

import { AggregateStrip } from "./_components/aggregate-strip";
import { GalleryGrid } from "./_components/gallery-grid";

export default async function GalleryPage() {
  await connection();

  const data = await getGalleryData();

  if (data.status === "unavailable") {
    return (
      <>
        <PageHeader eyebrow="Showcase" title="Gallery" description={data.message} />
        <EmptyState title="Gallery unavailable" detail={data.message} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Showcase"
        title="Gallery"
        description="Every deployed campaign and its creative, with delivery and results. Read-only — the app records and measures; it does not send."
      />
      {data.campaigns.length === 0 ? (
        <EmptyState title="Nothing deployed yet" detail="Launch a campaign from Campaigns and it will appear here once it goes live." />
      ) : (
        <>
          <AggregateStrip totals={data.totals} />
          <GalleryGrid campaigns={data.campaigns} />
        </>
      )}
    </>
  );
}
