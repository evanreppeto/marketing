import { RecordView } from "./_components/record-view";
import "./record.css";

export const metadata = { title: "Record — Arc CRM" };

export default async function CrmRecordPage({
  searchParams,
}: {
  params: Promise<{ recordId: string }>;
  searchParams: Promise<{ name?: string }>;
}) {
  const sp = await searchParams;
  const name = sp.name?.trim() || "Linda Powers";
  return <RecordView name={name} />;
}
