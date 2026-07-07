import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

import { ArcView } from "./_components/arc-view";
import "./arc.css";

export const metadata = { title: "Arc" };

export default async function ArcPage() {
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";
  return <ArcView brandName={brandName} />;
}
