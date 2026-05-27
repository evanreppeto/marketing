import { CrmRecordPage, getCrmRecordParams } from "../../_components/crm-record-page";

type DetailPageProps = {
  params: Promise<{ recordId: string }>;
  searchParams?: Promise<{ action?: string | string[] }>;
};

export function generateStaticParams() {
  return getCrmRecordParams("leads");
}

export default async function LeadRecordPage({ params, searchParams }: DetailPageProps) {
  const { recordId } = await params;
  const query: { action?: string | string[] } = searchParams ? await searchParams : {};

  return <CrmRecordPage action={getAction(query.action)} objectKey="leads" recordId={recordId} />;
}

function getAction(action: string | string[] | undefined) {
  return Array.isArray(action) ? action[0] : action;
}
