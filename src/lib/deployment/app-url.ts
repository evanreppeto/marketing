type EnvLike = Record<string, string | undefined>;

function cleanUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed || null;
}

function withProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = cleanUrl(value);
  if (!trimmed) throw new Error("App base URL is required.");
  return withProtocol(trimmed);
}

export function resolveAppBaseUrl(headersList?: Headers | null, env: EnvLike = process.env): string {
  const explicit = cleanUrl(env.GROWTH_APP_BASE_URL) ?? cleanUrl(env.NEXT_PUBLIC_APP_URL) ?? cleanUrl(env.APP_URL);
  if (explicit) return normalizeBaseUrl(explicit);

  const vercelUrl = cleanUrl(env.VERCEL_PROJECT_PRODUCTION_URL) ?? cleanUrl(env.VERCEL_URL);
  if (vercelUrl) return normalizeBaseUrl(vercelUrl);

  const forwardedHost = cleanUrl(headersList?.get("x-forwarded-host") ?? undefined);
  const host = forwardedHost ?? cleanUrl(headersList?.get("host") ?? undefined);
  if (host) {
    const proto = cleanUrl(headersList?.get("x-forwarded-proto") ?? undefined) ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return "http://localhost:3000";
}
