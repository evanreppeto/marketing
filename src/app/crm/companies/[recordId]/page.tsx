import type { Metadata } from "next";
import { connection } from "next/server";

import { CrmRecordPage } from "../../_components/crm-record-page";
import { getCrmRecordData } from "@/lib/crm/read-model";

export async function generateMetadata({ params }: { params: Promise<{ recordId: string }> }): Promise<Metadata> {
  try {
    const { recordId } = await params;
    const data = await getCrmRecordData("companies", recordId);
    return { title: (data.status === "live" ? data.name?.trim() : null) || "Company" };
  } catch {
    return { title: "Company" };
  }
}

type PageProps = {
  params: Promise<{ recordId: string }>;
  searchParams?: Promise<{ action?: string | string[] }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  await connection();

  const { recordId } = await params;
  const query = searchParams ? await searchParams : {};

  return <CrmRecordPage action={getValue(query.action)} objectKey="companies" recordId={recordId} />;
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
