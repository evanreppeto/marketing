import { redirect } from "next/navigation";

// Campaigns is the single surface of the app right now; the root lands there.
export default function Page() {
  redirect("/campaigns");
}
