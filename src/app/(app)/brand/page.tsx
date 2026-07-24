import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getBrandProfileView } from "@/lib/brand-kit/profile-view";

import { BrandView } from "./_components/brand-view";
import "./brand.css";

export const metadata = { title: "Brand — Arc Studio" };

export default async function BrandPage() {
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const brandName = ctx?.orgName?.trim() || "Your workspace";
  const view = await getBrandProfileView(ctx?.orgId ?? "", brandName);
  return <BrandView view={view} />;
}
