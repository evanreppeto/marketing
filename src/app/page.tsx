import { redirect } from "next/navigation";

import { getAuthMode } from "@/lib/auth/auth-mode";

import { LandingView } from "./landing/_components/landing-view";

export const metadata = {
  title: "Arc Studio — The marketing operator that never sends without you",
  description:
    "Arc finds source-backed opportunities, drafts complete campaign packages, and prepares creative — then waits for your approval before anything reaches the outside world.",
};

// The app's front door. In supabase mode (production, arc-studio.ai) the root
// IS the public marketing landing page: the proxy sends signed-in members to
// /home before this renders, so only signed-out visitors reach it. In
// open/operator mode (local dev, demos) the root still drops straight into the
// app — the landing stays reachable at /landing.
export default function RootPage() {
  if (getAuthMode() !== "supabase") {
    redirect("/home");
  }
  return <LandingView />;
}
