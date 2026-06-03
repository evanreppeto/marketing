import { connection } from "next/server";

import { getCrmNavCounts, getCrmObjectData } from "@/lib/crm/read-model";

import { CrmObjectPage } from "../_components/crm-object-page";

type PageProps = {
  searchParams?: Promise<{ action?: string | string[]; section?: string | string[]; view?: string | string[] }>;
};

export default async function Page({ searchParams }: PageProps) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const [liveObject, navCounts] = await Promise.all([getCrmObjectData("jobs"), getCrmNavCounts()]);

  return (
    <CrmObjectPage
      action={getValue(query.action)}
      liveMessage={liveObject.status === "unavailable" ? liveObject.message : undefined}
      liveObject={liveObject.status === "live" ? liveObject : undefined}
      navCounts={navCounts.status === "live" ? navCounts.counts : undefined}
      objectKey="jobs"
      section={getValue(query.section)}
      view={getValue(query.view)}
    />
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
