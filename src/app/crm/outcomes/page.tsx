import { connection } from "next/server";

import { CrmObjectPage } from "../_components/crm-object-page";
import { getCrmObjectData } from "@/lib/crm/read-model";

export default async function OutcomesCrmPage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string | string[]; view?: string | string[] }>;
}) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const crmObject = await getCrmObjectData("outcomes");
  return (
    <CrmObjectPage
      action={getValue(query.action)}
      liveMessage={crmObject.status === "unavailable" ? crmObject.message : undefined}
      liveObject={crmObject.status === "live" ? crmObject : undefined}
      objectKey="outcomes"
      view={getValue(query.view)}
    />
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
