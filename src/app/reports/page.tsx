import { redirect } from "next/navigation";

/** Analytics is now the single home for performance insight. Old /reports links
 *  (and bookmarks) land on the consolidated analytics page. */
export default function ReportsPage() {
  redirect("/analytics");
}
