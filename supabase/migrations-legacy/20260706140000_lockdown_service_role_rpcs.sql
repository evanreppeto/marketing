-- Lock down the service-role-only SECURITY DEFINER RPCs by revoking EXECUTE from
-- the anon and authenticated roles.
--
-- 20260619154500_google_drive_vault_rpc_wrappers.sql (arc_create_vault_secret,
-- arc_read_vault_secret) and 20260621130000_knowledge_node_embeddings.sql
-- (match_knowledge_nodes) each did `revoke all ... from public` +
-- `grant execute ... to service_role`, intending these to be service-role-only.
-- But Supabase's default privileges grant EXECUTE directly to the anon and
-- authenticated roles at CREATE time, and `revoke ... from public` does NOT
-- remove those explicit per-role grants — so a security advisor flagged all
-- three as callable by anon/authenticated over PostgREST (/rest/v1/rpc/...).
--
-- arc_read_vault_secret is the dangerous one: SECURITY DEFINER, no internal auth
-- check, and it returns the DECRYPTED secret for any id. anon EXECUTE therefore
-- meant anyone with the public anon key could read stored credentials (Google
-- Drive refresh tokens, etc.). arc_create_vault_secret let anon write secrets;
-- match_knowledge_nodes let anon/authenticated run cross-org vector search
-- (SECURITY DEFINER bypasses RLS and the caller passes match_org_id).
--
-- The app only ever calls these through the service-role admin client
-- (getSupabaseAdminClient), so revoking anon/authenticated changes no app path.

revoke execute on function public.arc_create_vault_secret(text, text, text) from anon, authenticated;
revoke execute on function public.arc_read_vault_secret(uuid) from anon, authenticated;
revoke execute on function public.match_knowledge_nodes(text, uuid, int, text[]) from anon, authenticated;

-- Re-assert the intended grant (idempotent; the source migrations already set it).
grant execute on function public.arc_create_vault_secret(text, text, text) to service_role;
grant execute on function public.arc_read_vault_secret(uuid) to service_role;
grant execute on function public.match_knowledge_nodes(text, uuid, int, text[]) to service_role;
