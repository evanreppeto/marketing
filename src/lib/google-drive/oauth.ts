export const GOOGLE_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"] as const;

export type GoogleDriveConfig =
  | {
      ok: true;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      missing: [];
    }
  | {
      ok: false;
      clientId: string | null;
      clientSecret: string | null;
      redirectUri: string;
      missing: string[];
    };

export function googleDriveRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/integrations/google-drive/callback`;
}

export function resolveGoogleDriveConfig(
  env: Record<string, string | undefined> = process.env,
  origin = env.NEXT_PUBLIC_APP_URL ?? env.VERCEL_URL ?? "http://localhost:3000",
): GoogleDriveConfig {
  const normalizedOrigin = origin.startsWith("http") ? origin : `https://${origin}`;
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = env.GOOGLE_DRIVE_REDIRECT_URI?.trim() || googleDriveRedirectUri(normalizedOrigin);
  const missing = [
    !clientId ? "GOOGLE_DRIVE_CLIENT_ID" : null,
    !clientSecret ? "GOOGLE_DRIVE_CLIENT_SECRET" : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    return {
      ok: false,
      clientId: clientId || null,
      clientSecret: clientSecret || null,
      redirectUri,
      missing,
    };
  }

  return { ok: true, clientId, clientSecret, redirectUri, missing: [] };
}

export function buildGoogleDriveAuthUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DRIVE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export type GoogleDriveTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function formBody(values: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return body;
}

async function parseTokenResponse(response: Response): Promise<GoogleDriveTokenSet> {
  const payload = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? `Google OAuth failed (${response.status})`);
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresIn: payload.expires_in ?? null,
    scope: payload.scope ?? GOOGLE_DRIVE_SCOPES.join(" "),
  };
}

export async function exchangeGoogleDriveCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetcher?: typeof fetch;
}): Promise<GoogleDriveTokenSet> {
  const response = await (input.fetcher ?? fetch)("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formBody({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  return parseTokenResponse(response);
}

export async function refreshGoogleDriveAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetcher?: typeof fetch;
}): Promise<GoogleDriveTokenSet> {
  const response = await (input.fetcher ?? fetch)("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formBody({
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  return parseTokenResponse(response);
}
