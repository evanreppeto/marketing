import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { NEUTRAL_DEFAULTS, validateBusinessProfile, type BusinessProfile, type ProofPoint } from "@/domain";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { storeBrandImageFromUrl } from "@/lib/brand-kit/brand-image";

export const runtime = "nodejs"; // image store needs node:dns + fetch redirect control

/**
 * Lets Arc PROPOSE a brand profile (from website analysis + Q&A). Always writes
 * status:"draft" — Arc can never activate; the operator flips draft->active in
 * Settings. Refuses to overwrite a live (active) profile. Merges the proposed
 * fields onto the current profile (or NEUTRAL_DEFAULTS).
 *
 *   PUT /api/v1/arc/brand/profile
 *   { displayName?, tagline?, description?, industry?, websiteUrl?, logoUrl?,
 *     faviconUrl?, accent?, tone?, voiceGuidance?, services?, serviceAreas?,
 *     preferredPhrases?, bannedPhrases?, proofPoints?, guardrails? }
 *   -> 200 { ok, profile } | 409 locked | 400 rejected
 */
export async function PUT(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const body = payload as Record<string, unknown>;

  const orgId = allowed.scope.orgId;

  const current = (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS;
  if (current.status === "active") {
    return fail("locked", "An active Brand Kit already exists. Ask the operator to edit it in Settings.", 409);
  }

  const str = (v: unknown, fallback: string | null): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;
  const strList = (v: unknown, fallback: string[]): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : fallback;

  const proofPoints: ProofPoint[] = Array.isArray(body.proofPoints)
    ? (body.proofPoints as unknown[]).flatMap((p) => {
        if (typeof p !== "object" || p === null) return [];
        const o = p as Record<string, unknown>;
        const kind = o.kind === "certification" || o.kind === "stat" ? o.kind : "testimonial";
        const label = typeof o.label === "string" ? o.label.trim() : "";
        if (!label) return [];
        return [{ kind, label, ...(typeof o.detail === "string" ? { detail: o.detail.trim() } : {}) } as ProofPoint];
      })
    : current.proofPoints;

  const g = typeof body.guardrails === "object" && body.guardrails !== null ? (body.guardrails as Record<string, unknown>) : {};

  const HEX = /^#[0-9a-fA-F]{6}$/;
  const paletteIn =
    typeof body.brandPalette === "object" && body.brandPalette !== null
      ? (body.brandPalette as Record<string, unknown>)
      : {};
  const slot = (name: "primary" | "secondary" | "accent" | "dark" | "light") => {
    const v = paletteIn[name];
    return typeof v === "string" && HEX.test(v.trim())
      ? { label: current.brandPalette[name].label, hex: v.trim().toLowerCase() }
      : current.brandPalette[name];
  };
  const brandPalette = {
    ...current.brandPalette,
    primary: slot("primary"),
    secondary: slot("secondary"),
    accent: slot("accent"),
    dark: slot("dark"),
    light: slot("light"),
    headingFont: str(body.headingFont, current.brandPalette.headingFont) ?? current.brandPalette.headingFont,
    bodyFont: str(body.bodyFont, current.brandPalette.bodyFont) ?? current.brandPalette.bodyFont,
  };

  // Store (not hotlink) any newly-provided external logo/favicon URL.
  const sourceUrl = str(body.websiteUrl, current.websiteUrl) ?? "";
  // Non-http(s) values (relative paths, data: URIs) and unchanged values pass
  // through unstored by design; a fresh external URL is downloaded + stored so we
  // never hotlink. If the store fails, keep the current value rather than persist
  // a URL the SSRF guard just judged unfetchable.
  const resolveImage = async (raw: unknown, role: "logo" | "favicon", currentValue: string | null) => {
    const value = str(raw, currentValue);
    if (!value || value === currentValue || !/^https?:\/\//i.test(value)) return value;
    const stored = await storeBrandImageFromUrl({ orgId, url: value, role, sourceUrl, uploadedBy: "arc" });
    return stored ?? currentValue;
  };
  const logoUrl = await resolveImage(body.logoUrl, "logo", current.logoUrl);
  const faviconUrl = await resolveImage(body.faviconUrl, "favicon", current.faviconUrl);

  const merged: BusinessProfile = {
    ...current,
    displayName: str(body.displayName, current.displayName || "") ?? "",
    tagline: str(body.tagline, current.tagline),
    description: str(body.description, current.description),
    industry: str(body.industry, current.industry),
    websiteUrl: str(body.websiteUrl, current.websiteUrl),
    logoUrl,
    faviconUrl,
    accent: str(body.accent, current.accent) ?? current.accent,
    tone: str(body.tone, current.tone) ?? current.tone,
    voiceGuidance: str(body.voiceGuidance, current.voiceGuidance),
    services: strList(body.services, current.services),
    serviceAreas: strList(body.serviceAreas, current.serviceAreas),
    preferredPhrases: strList(body.preferredPhrases, current.preferredPhrases),
    bannedPhrases: strList(body.bannedPhrases, current.bannedPhrases),
    proofPoints,
    guardrails: {
      disallowedClaims: strList(g.disallowedClaims, current.guardrails.disallowedClaims),
      complianceNotes: str(g.complianceNotes, current.guardrails.complianceNotes) ?? current.guardrails.complianceNotes,
    },
    brandPalette,
    status: "draft", // Arc can never activate
  };

  const validation = validateBusinessProfile(merged);
  if (!validation.ok) {
    return fail("rejected", `Invalid profile: ${validation.errors.join(", ")}.`, 400);
  }

  try {
    const profile = await upsertBusinessProfile(orgId, merged);
    return ok({ profile });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to save the brand profile.", 502);
  }
}
