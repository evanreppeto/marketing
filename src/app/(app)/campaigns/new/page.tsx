import { redirect } from "next/navigation";

// The static campaign builder that used to live here was a hardcoded mockup with fabricated
// "intelligence" and dead buttons, and is no longer linked from anywhere in the app. The real
// campaign-creation flow is the NewCampaignModal on /campaigns. Redirect so the old URL (and its
// breadcrumb) can never surface the fake screen again.
export default function CampaignBuilderPage() {
  redirect("/campaigns");
}
