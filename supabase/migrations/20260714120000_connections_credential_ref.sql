-- supabase/migrations/20260714120000_connections_credential_ref.sql
-- Per-workspace Resend API key. Until now the Resend secret was a single
-- deployment env var (RESEND_API_KEY) and the connections row held only the
-- enable switch, from-address, and test telemetry. Every other credentialed
-- connector (Gemini, Higgsfield) already stores its key per workspace as a Vault
-- secret referenced by workspace_connectors.credential_ref (uuid). This adds the
-- same column to `connections` so email delivery can use a per-workspace Resend
-- account too.
--
-- The plaintext key never lands here: the ref points at a vault secret written
-- via create_secret (see src/lib/connectors/credentials.ts), read back on demand
-- through vault.decrypted_secrets. executeResendDispatch prefers the workspace's
-- stored key and falls back to RESEND_API_KEY, so this column is additive and
-- backward-compatible — an existing deployment with no stored key keeps working.

alter table public.connections
  add column if not exists credential_ref uuid;
