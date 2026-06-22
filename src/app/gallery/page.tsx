import { connection } from "next/server";
import Link from "next/link";

import { EmptyState, PageHeader, StatusPill } from "@/app/_components/page-header";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getGalleryData } from "@/lib/gallery/read-model";
import { getMediaGallery } from "@/lib/campaigns/gallery";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import "./gallery.css";
import { AggregateStrip } from "./_components/aggregate-strip";
import { GalleryGrid } from "./_components/gallery-grid";
import { GalleryView } from "./_components/gallery-view";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Gallery" };

type GalleryViewParam = "media" | "showcase";

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await connection();
  const { view } = await searchParams;
  const active: GalleryViewParam = view === "showcase" ? "showcase" : "media";

  return (
    <>
      <PageHeader
        title="Gallery"
        description="Every piece of campaign media Arc has produced, plus the showcase of deployed campaigns. Read-only — the app records and measures; it does not send."
      />
      <GalleryTabs active={active} />
      <div className="mt-4">{active === "media" ? <MediaTab /> : <ShowcaseTab />}</div>
    </>
  );
}

function GalleryTabs({ active }: { active: GalleryViewParam }) {
  const tabs: Array<[GalleryViewParam, string]> = [
    ["media", "Media"],
    ["showcase", "Showcase"],
  ];
  return (
    <div className="flex gap-1 border-b border-[var(--border-hairline)]">
      {tabs.map(([key, label]) => (
        <Link
          key={key}
          href={key === "media" ? "/gallery" : `/gallery?view=${key}`}
          className={
            active === key
              ? "border-b-2 border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
              : "px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

async function MediaTab() {
  const gallery = await getMediaGallery();
  if (gallery.status !== "live" || gallery.items.length === 0) {
    return (
      <EmptyState
        title={gallery.status === "live" ? "No campaign media yet" : "Gallery unavailable"}
        detail={
          gallery.status === "live"
            ? "Once campaigns produce approved media and creative, it will show up here."
            : gallery.message
        }
      />
    );
  }
  const { totals } = gallery;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusPill tone="gray">{totals.media} media</StatusPill>
        <StatusPill tone="green">{totals.approved} approved</StatusPill>
        <StatusPill tone="red">{totals.ai} AI</StatusPill>
      </div>
      <GalleryView items={gallery.items} hero={gallery.hero} />
    </div>
  );
}

async function ShowcaseTab() {
  const orgId = isSupabaseAdminConfigured() ? await getCurrentOrgId().catch(() => undefined) : undefined;
  const data = await getGalleryData(undefined, orgId);
  if (data.status === "unavailable") {
    return <EmptyState title="Gallery unavailable" detail={data.message} />;
  }
  if (data.campaigns.length === 0) {
    return (
      <EmptyState title="Nothing deployed yet" detail="Launch a campaign from Campaigns and it will appear here once it goes live." />
    );
  }
  return (
    <>
      <AggregateStrip totals={data.totals} />
      <GalleryGrid campaigns={data.campaigns} />
    </>
  );
}
