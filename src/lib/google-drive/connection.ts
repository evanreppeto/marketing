import { type SupabaseClient } from "@supabase/supabase-js";

import { getOperatorActor } from "@/lib/auth/operator";
import { getConfiguredOperatorCredentials } from "@/lib/auth/operator-shared";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { refreshGoogleDriveAccessToken, resolveGoogleDriveConfig, type GoogleDriveTokenSet } from "./oauth";

type SecretRow = { decrypted_secret: string | null };
type RpcResult<T> = { data: T | null; error: { message: string } | null };
type SecretCreateData = string | { id?: string | null; create_secret?: string | null };
type VaultClient = SupabaseClient & {
  rpc(
    fn: "arc_create_vault_secret",
    args: { new_secret: string; new_name: string; new_description: string },
  ): Promise<RpcResult<SecretCreateData>>;
  rpc(fn: "arc_read_vault_secret", args: { secret_id: string }): Promise<RpcResult<string>>;
  schema(schema: "vault"): {
    from(table: "decrypted_secrets"): SupabaseClient["from"];
    rpc(
      fn: "create_secret",
      args: { new_secret: string; new_name: string; new_description: string },
    ): Promise<RpcResult<SecretCreateData>>;
  };
};

export type GoogleDriveConnectionRow = {
  org_id: string;
  connected_by: string;
  refresh_token_ref: string;
  scopes: string[];
  connected_email: string | null;
  connected_at: string;
  last_import_at: string | null;
  last_error: string | null;
};

type UntypedSelectChain = {
  eq(column: string, value: string): UntypedSelectChain;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
};

type UntypedUpdateChain = {
  eq(column: string, value: string): UntypedUpdateChain & Promise<{ error: { message: string } | null }>;
};

type UntypedSupabaseClient = {
  // New migration tables can lag generated Supabase types. Keep this escape hatch
  // local to this module instead of weakening the app-wide client type.
  from(table: string): {
    upsert(values: Record<string, unknown>, options?: { onConflict?: string }): Promise<{ error: { message: string } | null }>;
    select(columns: string): UntypedSelectChain;
    update(values: Record<string, unknown>): UntypedUpdateChain;
  };
};

async function legacyConnectedByCandidates(primary: string): Promise<string[]> {
  const candidates = new Set<string>();
  candidates.add(primary);
  candidates.add(await getOperatorActor());

  const configuredEmail = getConfiguredOperatorCredentials()?.email;
  if (configuredEmail) candidates.add(configuredEmail);

  candidates.add("Operator");
  return [...candidates];
}

function secretRefFromData(data: SecretCreateData | null): string | null {
  if (!data) return null;
  if (typeof data === "string") return data;
  return data.id ?? data.create_secret ?? null;
}

async function writeVaultSecret(
  client: SupabaseClient,
  name: string,
  plaintext: string,
  description: string,
): Promise<string> {
  let ref: string | null = null;

  try {
    const { data, error } = await (client as VaultClient).rpc("arc_create_vault_secret", {
      new_secret: plaintext,
      new_name: name,
      new_description: description,
    });
    if (!error) ref = secretRefFromData(data);
  } catch {
    ref = null;
  }

  if (!ref && typeof client.schema === "function") {
    try {
      const { data, error } = await (client as VaultClient).schema("vault").rpc("create_secret", {
        new_secret: plaintext,
        new_name: name,
        new_description: description,
      });
      if (!error) ref = secretRefFromData(data);
    } catch {
      ref = null;
    }
  }

  if (!ref) throw new Error("vault.create_secret: no id");
  return ref;
}

async function readVaultSecret(client: SupabaseClient, ref: string): Promise<string | null> {
  try {
    const { data, error } = await (client as VaultClient).rpc("arc_read_vault_secret", { secret_id: ref });
    if (!error && data) return data;
  } catch {
    // Fall through to direct vault schema access for environments that expose it.
  }

  try {
    const scoped = typeof client.schema === "function" ? client.schema("vault") : client;
    const { data, error } = await scoped
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("id", ref)
      .maybeSingle<SecretRow>();
    if (error || !data?.decrypted_secret) return null;
    return data.decrypted_secret;
  } catch {
    return null;
  }
}

export async function saveGoogleDriveConnection(input: {
  orgId: string;
  connectedBy: string;
  tokenSet: GoogleDriveTokenSet;
  connectedEmail?: string | null;
  client?: SupabaseClient;
}): Promise<void> {
  if (!input.tokenSet.refreshToken) {
    throw new Error("Google did not return a refresh token. Disconnect and connect again with consent.");
  }

  const client = input.client ?? getSupabaseAdminClient();
  const secretRef = await writeVaultSecret(
    client,
    `google_drive_refresh_token_${input.orgId}_${input.connectedBy.replace(/[^a-zA-Z0-9]+/g, "_")}`,
    input.tokenSet.refreshToken,
    "Google Drive refresh token for this user's manual Library imports",
  );

  const table: string = "google_drive_connections";
  const { error } = await (client as unknown as UntypedSupabaseClient).from(table).upsert(
    {
      org_id: input.orgId,
      connected_by: input.connectedBy,
      refresh_token_ref: secretRef,
      scopes: input.tokenSet.scope.split(/\s+/).filter(Boolean),
      connected_email: input.connectedEmail ?? null,
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "org_id,connected_by" },
  );
  if (error) throw new Error(`google_drive_connections upsert failed: ${error.message}`);
}

export async function getGoogleDriveConnection(
  orgId: string,
  connectedBy: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<GoogleDriveConnectionRow | null> {
  const table: string = "google_drive_connections";
  const { data, error } = await (client as unknown as UntypedSupabaseClient)
    .from(table)
    .select("*")
    .eq("org_id", orgId)
    .eq("connected_by", connectedBy)
    .maybeSingle();
  if (error) throw new Error(`google_drive_connections lookup failed: ${error.message}`);
  return (data as GoogleDriveConnectionRow | null) ?? null;
}

export async function getGoogleDriveConnectionWithFallback(
  orgId: string,
  connectedBy: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<GoogleDriveConnectionRow | null> {
  for (const candidate of await legacyConnectedByCandidates(connectedBy)) {
    const connection = await getGoogleDriveConnection(orgId, candidate, client);
    if (connection) return connection;
  }

  return null;
}

export async function resolveGoogleDriveAccessToken(input: {
  orgId: string;
  connectedBy: string;
  origin?: string;
  client?: SupabaseClient;
  fetcher?: typeof fetch;
}): Promise<string> {
  if (!isSupabaseAdminConfigured() && !input.client) {
    throw new Error("Supabase is not configured.");
  }

  const config = resolveGoogleDriveConfig(process.env, input.origin);
  if (!config.ok) {
    throw new Error(`Google Drive OAuth is missing: ${config.missing.join(", ")}`);
  }

  const client = input.client ?? getSupabaseAdminClient();
  const connection = await getGoogleDriveConnectionWithFallback(input.orgId, input.connectedBy, client);
  if (!connection) {
    throw new Error("Your Google Drive is not connected yet.");
  }

  const refreshToken = await readVaultSecret(client, connection.refresh_token_ref);
  if (!refreshToken) {
    throw new Error("Google Drive refresh token is unavailable.");
  }

  const tokenSet = await refreshGoogleDriveAccessToken({
    refreshToken,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    fetcher: input.fetcher,
  });
  return tokenSet.accessToken;
}

export async function recordGoogleDriveImportResult(input: {
  orgId: string;
  connectedBy: string;
  ok: boolean;
  error?: string | null;
  client?: SupabaseClient;
}): Promise<void> {
  const client = input.client ?? getSupabaseAdminClient();
  const table: string = "google_drive_connections";
  const { error } = await (client as unknown as UntypedSupabaseClient)
    .from(table)
    .update({
      last_import_at: new Date().toISOString(),
      last_error: input.ok ? null : (input.error ?? "Google Drive import failed."),
    })
    .eq("org_id", input.orgId)
    .eq("connected_by", input.connectedBy);
  if (error) throw new Error(`google_drive_connections import update failed: ${error.message}`);
}
