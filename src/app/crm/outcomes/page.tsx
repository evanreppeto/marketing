import { CrmObjectPage } from "../_components/crm-object-page";

export default async function OutcomesCrmPage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  return <CrmObjectPage action={getAction(query.action)} objectKey="outcomes" />;
}

function getAction(action: string | string[] | undefined) {
  return Array.isArray(action) ? action[0] : action;
}
