import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

import { BrandView } from "./_components/brand-view";
import "./brand.css";

export const metadata = { title: "Brand — Arc" };

export default async function BrandPage() {
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";
  return <BrandView brandName={brandName} />;
}
