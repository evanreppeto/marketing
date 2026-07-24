import { LandingView } from "./_components/landing-view";

export const metadata = {
  title: "Arc Studio — The marketing operator that never sends without you",
  description:
    "Arc finds source-backed opportunities, drafts complete campaign packages, and prepares creative — then waits for your approval before anything reaches the outside world.",
};

// Public marketing landing page. Signed-out visitors on `/` are routed here by
// the proxy; the page itself is exempted from the auth gate (see proxy matcher).
export default function LandingPage() {
  return <LandingView />;
}
