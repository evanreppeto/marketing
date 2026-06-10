import { redirect } from "next/navigation";

// The app opens into Mark. The full Briefing lives at /mark (built in a later
// plan); the home route simply forwards there so there is one front door.
export default function HomePage() {
  redirect("/mark");
}
