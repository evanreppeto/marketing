import { redirect } from "next/navigation";

// The app opens into Arc. The full Briefing lives at /arc (built in a later
// plan); the home route simply forwards there so there is one front door.
export default function HomePage() {
  redirect("/arc");
}
