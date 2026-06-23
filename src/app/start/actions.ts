"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { NEUTRAL_DEFAULTS, type BusinessProfile } from "@/domain";
import { dismissActivation, markBrandCaptured } from "@/lib/activation/persistence";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { fetchBrandSignalFromUrl } from "@/lib/brand-kit/website-fetch";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type StartPreview = {
  websiteUrl: string;
  signal: { title: string | null; description: string | null; faviconUrl: string | null; text: string };
};

export type StartActionState =
  | null
  | ({ phase: "preview" } & StartPreview)
  | { phase: "error"; message: string };

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** Phase 1: fetch the owner's website and return the extracted brand signal for review. */
export async function analyzeWebsiteAction(
  _prev: StartActionState,
  formData: FormData,
): Promise<StartActionState> {
  await requireOperator();

  const websiteUrl = field(formData, "websiteUrl");
  if (!websiteUrl) {
    return { phase: "error", message: "Enter your website address so Arc can learn your brand." };
  }

  const result = await fetchBrandSignalFromUrl(websiteUrl);
  if (!result.ok) {
    return { phase: "error", message: result.message };
  }

  return { phase: "preview", websiteUrl, signal: result.signal };
}

/** Phase 2: persist the confirmed brand to the Brand Kit and mark first-run brand capture done. */
export async function confirmBrandAction(formData: FormData): Promise<void> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    redirect("/start?error=not_configured");
  }

  const ctx = await getCurrentWorkspaceContext();
  const existing = await getBusinessProfile(ctx.orgId);
  const base = existing ?? NEUTRAL_DEFAULTS;

  const profile: BusinessProfile = {
    ...base,
    displayName: field(formData, "displayName") || base.displayName || ctx.orgName,
    websiteUrl: field(formData, "websiteUrl") || base.websiteUrl,
    description: field(formData, "description") || base.description,
    faviconUrl: field(formData, "faviconUrl") || base.faviconUrl,
    status: "active",
  };

  await upsertBusinessProfile(ctx.orgId, profile);
  await markBrandCaptured(ctx.orgId);
  revalidatePath("/");
  redirect("/");
}

/** Dismiss the home "finish setting up" checklist without leaving the current page. */
export async function dismissActivationAction(): Promise<void> {
  await requireOperator();

  if (isSupabaseAdminConfigured()) {
    try {
      const ctx = await getCurrentWorkspaceContext();
      await dismissActivation(ctx.orgId);
    } catch {
      // best-effort
    }
  }

  revalidatePath("/");
}

/** Let the owner skip first-run setup; dismisses the home checklist and continues to the app. */
export async function skipActivationAction(): Promise<void> {
  await requireOperator();

  if (isSupabaseAdminConfigured()) {
    try {
      const ctx = await getCurrentWorkspaceContext();
      await dismissActivation(ctx.orgId);
    } catch {
      // best-effort; never block leaving setup
    }
  }

  revalidatePath("/");
  redirect("/");
}
