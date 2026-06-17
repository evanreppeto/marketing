import { NEUTRAL_DEFAULTS, INDUSTRY_TEMPLATES } from "@/domain";
import { getBusinessProfile } from "@/lib/brand-kit/persistence";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { BrandKitForm } from "./brand-kit-form";
import { SettingsSection } from "./settings-section";

export async function BrandKitSettings() {
  let profile = NEUTRAL_DEFAULTS;

  if (isSupabaseAdminConfigured()) {
    try {
      const orgId = await getCurrentOrgId();
      profile = (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS;
    } catch {
      // Supabase unreachable — fall back to defaults so the page doesn't crash.
      profile = NEUTRAL_DEFAULTS;
    }
  }

  // Serializable template list: id + label only. The client imports
  // applyIndustryTemplate directly to avoid passing functions across the
  // server/client boundary (this repo has crashed prod on that before).
  const templates = INDUSTRY_TEMPLATES.map((t) => ({ id: t.id, label: t.label }));

  return (
    <SettingsSection
      description="Your business identity, voice, services, and guardrails — what Arc works from."
      title="Brand Kit"
    >
      <BrandKitForm
        initialDisplayName={profile.displayName}
        initialLegalName={profile.legalName ?? ""}
        initialTagline={profile.tagline ?? ""}
        initialDescription={profile.description ?? ""}
        initialIndustry={profile.industry ?? ""}
        initialWebsiteUrl={profile.websiteUrl ?? ""}
        initialFaviconUrl={profile.faviconUrl ?? ""}
        initialShortMark={profile.shortMark ?? ""}
        initialLogoUrl={profile.logoUrl ?? ""}
        initialServiceAreas={profile.serviceAreas.join("\n")}
        initialTone={profile.tone}
        initialVoiceGuidance={profile.voiceGuidance ?? ""}
        initialPreferredPhrases={profile.preferredPhrases.join("\n")}
        initialBannedPhrases={profile.bannedPhrases.join("\n")}
        initialServices={profile.services.join("\n")}
        initialDisallowedClaims={profile.guardrails.disallowedClaims.join("\n")}
        initialComplianceNotes={profile.guardrails.complianceNotes}
        initialProofPoints={profile.proofPoints.map((p) => p.label).join("\n")}
        initialStatus={profile.status}
        templates={templates}
      />
    </SettingsSection>
  );
}
