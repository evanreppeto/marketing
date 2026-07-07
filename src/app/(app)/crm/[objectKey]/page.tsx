import { redirect } from "next/navigation";

// The record graph lives at /crm/[objectKey]/[recordId]. A bare object segment
// (or a stale /crm/{id} link from before the record route was wired) has no page
// of its own — send it back to the CRM board.
export default function CrmObjectIndex() {
  redirect("/crm");
}
