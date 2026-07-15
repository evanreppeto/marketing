-- Lock down SECURITY DEFINER RPCs that must never be reachable via PostgREST (anon / authenticated).
--
-- Background: three SECURITY DEFINER functions shipped in the baseline are exposed to `anon`
-- and `authenticated` — meaning they are callable by anyone holding the public
-- NEXT_PUBLIC_SUPABASE_ANON_KEY. All three are only ever invoked server-side through the
-- service-role admin client (getSupabaseAdminClient), so no first-party caller needs the
-- anon/authenticated grant:
--   * arc_create_vault_secret / arc_read_vault_secret — write/decrypt Supabase Vault secrets
--     (per-workspace Resend keys, Google Drive OAuth tokens, connector credentials) with no
--     in-body authorization. Callers: src/lib/google-drive/connection.ts (admin client only).
--   * match_knowledge_nodes — runs as definer and filters on a caller-supplied org id, bypassing
--     knowledge_nodes RLS. Caller: src/lib/knowledge-graph/recall.ts (admin client only).
--
-- Note on PUBLIC: Postgres grants EXECUTE to PUBLIC by default for every function, so `anon`
-- (a member of PUBLIC) can still execute unless we revoke from PUBLIC explicitly. Revoking only
-- the named anon grant is insufficient — hence `from public` below. We then re-grant to
-- service_role only. An in-body auth.uid() membership check is deliberately NOT added: these run
-- under service_role, which has no auth.uid(), so such a check would break the legitimate caller.
-- The functions stay protected by the app layer (requireOperator + explicit org scoping) on the
-- only role that can now reach them.
--
-- REVOKE is a no-op when the grant is absent, so this migration is safe to apply even if a prior
-- environment was already hand-patched.

revoke execute on function public.arc_create_vault_secret(text, text, text) from public, anon, authenticated;
grant execute on function public.arc_create_vault_secret(text, text, text) to service_role;

revoke execute on function public.arc_read_vault_secret(uuid) from public, anon, authenticated;
grant execute on function public.arc_read_vault_secret(uuid) to service_role;

revoke execute on function public.match_knowledge_nodes(text, uuid, integer, text[]) from public, anon, authenticated;
grant execute on function public.match_knowledge_nodes(text, uuid, integer, text[]) to service_role;
