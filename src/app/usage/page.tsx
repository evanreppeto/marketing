import { PageHeader } from "@/app/_components/page-header";
import { loadWorkspaceUsage, type UsageRange, USAGE_RANGES } from "@/lib/ai-usage/read-model";

import { UsageDashboard } from "./_components/usage-dashboard";

export const dynamic = "force-dynamic";

function parseRange(value: string | string[] | undefined): UsageRange {
  const raw = Array.isArray(value) ? value[0] : value;
  return (USAGE_RANGES as string[]).includes(raw ?? "") ? (raw as UsageRange) : "30d";
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const { range } = await searchParams;
  const usage = await loadWorkspaceUsage(parseRange(range));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title="AI Usage" description="Estimated cost and volume across the AI this workspace runs." />
      <UsageDashboard usage={usage} />
    </div>
  );
}
