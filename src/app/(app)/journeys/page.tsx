import { headers } from "next/headers";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getJourneysReadModel } from "@/lib/journey/read-model";

import { JourneysView } from "./_components/journeys-view";

export const metadata = { title: "Journeys — Arc" };

export default async function JourneysPage() {
  const [ctx, headerList] = await Promise.all([getCurrentWorkspaceContext().catch(() => null), headers()]);
  const model = await getJourneysReadModel(undefined, ctx?.orgId).catch(
    () => ({ status: "unavailable", message: "Journey data is unavailable." }) as const,
  );
  // App origin for the copy-paste collector snippet, resolved server-side so the
  // install panel shows the real host with no client-side hydration mismatch.
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const origin = host ? `${headerList.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  return <JourneysView model={model} origin={origin} />;
}
