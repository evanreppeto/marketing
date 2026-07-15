import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getJourneysReadModel } from "@/lib/journey/read-model";

import { JourneysView } from "./_components/journeys-view";

export const metadata = { title: "Journeys — Arc" };

export default async function JourneysPage() {
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const model = await getJourneysReadModel(undefined, ctx?.orgId).catch(
    () => ({ status: "unavailable", message: "Journey data is unavailable." }) as const,
  );
  return <JourneysView model={model} />;
}
