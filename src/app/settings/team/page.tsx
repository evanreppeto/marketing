import { redirect } from "next/navigation";

// Legacy standalone team page — superseded by the Team section inside the main
// Settings screen (src/app/(app)/settings, "Team" nav item), which shares the
// app shell and the same wired invite/role/remove actions. This route is kept
// only to redirect old links/bookmarks to the canonical location.
export default function LegacyTeamRedirect() {
  redirect("/settings");
}
