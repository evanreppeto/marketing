import Link from "next/link";

import { NEUTRAL_DEFAULTS } from "@/domain";
import { getBusinessProfile } from "@/lib/brand-kit/persistence";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { buttonClasses } from "@/app/_components/page-header";

import { SettingsSection } from "./settings-section";

const VALID_HEX = /^#[0-9a-fA-F]{6}$/;

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

  const swatches = [
    profile.brandPalette.primary,
    profile.brandPalette.secondary,
    profile.brandPalette.accent,
    profile.brandPalette.dark,
    profile.brandPalette.light,
  ].filter((slot) => VALID_HEX.test(slot.hex));

  return (
    <SettingsSection
      description="Your brand identity, voice, and rules — what Arc works from. Manage it on the Brand page."
      title="Brand Kit"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
        <div className="min-w-0">
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {profile.displayName || "Brand not set"}
          </div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
            {profile.status === "active" ? "Active for Arc" : "Draft"}
          </div>
          {swatches.length > 0 ? (
            <div className="mt-2 flex items-center gap-1.5">
              {swatches.map((slot) => (
                <span
                  key={slot.hex}
                  aria-label={slot.label || slot.hex}
                  className="inline-block h-4 w-4 rounded-full border border-[var(--border-hairline)]"
                  style={{ backgroundColor: slot.hex }}
                  title={slot.label || slot.hex}
                />
              ))}
            </div>
          ) : null}
        </div>
        <Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/brand">
          Edit on the Brand page
        </Link>
      </div>
    </SettingsSection>
  );
}
