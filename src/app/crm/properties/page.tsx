import { connection } from "next/server";

import { getCrmNavCounts, getCrmObjectData } from "@/lib/crm/read-model";
import { getAgentName } from "@/lib/settings/agent-name";

import { CrmObjectPage } from "../_components/crm-object-page";

type PageProps = {
  searchParams?: Promise<{ action?: string | string[]; view?: string | string[] }>;
};

export default async function Page({ searchParams }: PageProps) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const [liveObject, navCounts, agentName] = await Promise.all([getCrmObjectData("properties"), getCrmNavCounts(), getAgentName()]);

  return (
    <CrmObjectPage
      action={getValue(query.action)}
      agentName={agentName}
      liveMessage={liveObject.status === "unavailable" ? liveObject.message : undefined}
      liveObject={liveObject.status === "live" ? liveObject : undefined}
      navCounts={navCounts.status === "live" ? navCounts.counts : undefined}
      objectKey="properties"
      view={getValue(query.view)}
    />
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
