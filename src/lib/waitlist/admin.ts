/**
 * Who may read the waitlist.
 *
 * `waitlist_signups` is a PLATFORM-level table — it has no org_id, so it is not
 * workspace-scoped like the rest of the app. Showing it in ordinary workspace
 * settings would expose every signup to every tenant admin, so the viewer is
 * gated to an explicit allowlist of platform operators:
 *
 *   ARC_PLATFORM_ADMIN_EMAILS="you@example.com,cofounder@example.com"
 *
 * Unset (the default) means nobody sees it and the section stays hidden. Pure so
 * it stays unit-testable and can be enforced server-side before any data is read.
 */
export function parsePlatformAdmins(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function isPlatformAdmin(
  email: string | null | undefined,
  raw: string | null | undefined = process.env.ARC_PLATFORM_ADMIN_EMAILS,
): boolean {
  const allowed = parsePlatformAdmins(raw);
  if (allowed.length === 0) return false;
  const candidate = email?.trim().toLowerCase();
  if (!candidate) return false;
  return allowed.includes(candidate);
}
