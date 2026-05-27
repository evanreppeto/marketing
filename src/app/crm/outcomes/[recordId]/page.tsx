import { CrmRecordPage, getCrmRecordParams } from "../../_components/crm-record-page";

type DetailPageProps = {
  params: Promise<{ recordId: string }>;
  searchParams?: Promise<{ action?: string | string[] }>;
};

export function generateStaticParams() {
  return getCrmRecordParams("outcomes");
}

export default async function OutcomeRecordPage({ params, searchParams }: DetailPageProps) {
  const { recordId } = await params;
  const query: { action?: string | string[] } = searchParams ? await searchParams : {};

  return <CrmRecordPage action={getAction(query.action)} objectKey="outcomes" recordId={recordId} />;
}

function getAction(action: string | string[] | undefined) {
  return Array.isArray(action) ? action[0] : action;
}
