import { redirect } from "next/navigation";

// The app's front door. The root `/` is no longer the static mockup gallery —
// it enters the real app. In supabase auth mode the proxy routes `/` first
// (signed-in → /home, otherwise → /login); in open/demo mode it falls through
// to here and we send the caller to /home.
export default function RootPage() {
  redirect("/home");
}
