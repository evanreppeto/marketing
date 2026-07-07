import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

import { StudioView } from "./_components/studio-view";
import "./studio.css";

export const metadata = { title: "Studio — Arc" };

export default async function StudioPage() {
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";
  return <StudioView brandName={brandName} />;
}
