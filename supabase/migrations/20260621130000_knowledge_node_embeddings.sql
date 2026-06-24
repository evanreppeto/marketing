-- Semantic recall (SP3b): embeddings on knowledge_nodes + a cosine-match RPC.
create extension if not exists vector;

alter table public.knowledge_nodes
  add column if not exists embedding vector(768);

create index if not exists knowledge_nodes_embedding_idx
  on public.knowledge_nodes using hnsw (embedding vector_cosine_ops);

-- Service-role-only cosine match. Returns candidate fields (not just ids) so the
-- recall path needs no second query. query_embedding arrives as text ('[..]') and
-- is cast to vector to avoid PostgREST array-binding ambiguity. trust_tier is the
-- knowledge_trust_tier enum, so it is cast to text for the text[] membership test
-- and the text return column (an uncast enum = text comparison fails at creation
-- with 42883, which blocked this whole migration from applying).
create or replace function public.match_knowledge_nodes(
  query_embedding text,
  match_org_id uuid,
  match_count int,
  tiers text[]
)
returns table (id uuid, kind text, label text, summary text, tags text[], trust_tier text, distance float)
language sql
security definer
set search_path = public
as $$
  select n.id, n.kind, n.label, n.summary, n.tags, n.trust_tier::text,
         (n.embedding <=> query_embedding::vector) as distance
  from public.knowledge_nodes n
  where n.org_id = match_org_id
    and n.trust_tier::text = any(tiers)
    and n.embedding is not null
  order by n.embedding <=> query_embedding::vector
  limit match_count;
$$;

revoke all on function public.match_knowledge_nodes(text, uuid, int, text[]) from public;
grant execute on function public.match_knowledge_nodes(text, uuid, int, text[]) to service_role;
