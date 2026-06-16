-- Marketing Brain knowledge graph.
-- Generic property-graph overlay for Arc/Arc's durable marketing memory:
-- knowledge_nodes (brand facts, personas, proof, learnings, signals) + typed
-- knowledge_edges. Nodes REFERENCE existing typed rows (ref_table/ref_id) rather
-- than copying them, so the CRM/campaign tables stay the system of record.
-- `kind` and `relation` are app-validated text (vocabulary owned by the app
-- layer, unit-tested) — only the small, stable trust lifecycle is a DB enum.
-- Isolation is enforced in the app layer (service_role bypasses RLS); the RLS
-- policies below are defense-in-depth, matching crm_notes/crm_tasks.

create type public.knowledge_trust_tier as enum (
  'observed', 'proposed', 'trusted', 'rejected', 'archived'
);

-- Gated kinds (kept in sync with GATED_NODE_KINDS in src/domain/knowledge-graph.ts):
--   brand_fact, messaging_angle, cta, proof_point
-- A trusted node of a gated kind must carry an approver.
create table public.knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (length(btrim(kind)) > 0),
  key text,
  label text not null check (length(btrim(label)) > 0),
  body text,
  summary text,
  persona public.persona_mapping,
  trust_tier public.knowledge_trust_tier not null default 'observed',
  confidence integer check (confidence is null or confidence between 0 and 100),
  ref_table text,
  ref_id uuid,
  source text,
  source_reference text,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  tags text[] not null default '{}'::text[],
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_nodes_persona_not_unassigned_check
    check (persona is null or persona <> 'unassigned_persona'),
  constraint knowledge_nodes_ref_pairing_check
    check ((ref_table is null) = (ref_id is null)),
  constraint knowledge_nodes_gated_trust_check check (
    not (
      trust_tier = 'trusted'
      and kind in ('brand_fact', 'messaging_angle', 'cta', 'proof_point')
      and approved_by is null
    )
  )
);

create unique index knowledge_nodes_org_kind_key_unique_idx
  on public.knowledge_nodes (org_id, kind, key)
  where key is not null;
create index knowledge_nodes_kind_idx on public.knowledge_nodes (org_id, kind);
create index knowledge_nodes_trust_tier_idx on public.knowledge_nodes (org_id, trust_tier);
create index knowledge_nodes_persona_idx on public.knowledge_nodes (org_id, persona);
create index knowledge_nodes_ref_idx on public.knowledge_nodes (ref_table, ref_id)
  where ref_id is not null;
create index knowledge_nodes_tags_idx on public.knowledge_nodes using gin (tags);

create trigger knowledge_nodes_set_updated_at
  before update on public.knowledge_nodes
  for each row execute function public.set_updated_at();

create table public.knowledge_edges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  to_node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  relation text not null check (length(btrim(relation)) > 0),
  weight real,
  trust_tier public.knowledge_trust_tier not null default 'observed',
  source text,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_edges_no_self_loop check (from_node_id <> to_node_id)
);

create unique index knowledge_edges_unique_idx
  on public.knowledge_edges (from_node_id, relation, to_node_id);
create index knowledge_edges_from_idx on public.knowledge_edges (from_node_id);
create index knowledge_edges_to_idx on public.knowledge_edges (to_node_id);
create index knowledge_edges_relation_idx on public.knowledge_edges (org_id, relation);

create trigger knowledge_edges_set_updated_at
  before update on public.knowledge_edges
  for each row execute function public.set_updated_at();

-- RLS (defense-in-depth; service_role bypasses).
alter table public.knowledge_nodes enable row level security;
alter table public.knowledge_edges enable row level security;

create policy knowledge_nodes_current_org on public.knowledge_nodes
  for all to authenticated
  using (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org', true), '')::uuid);

create policy knowledge_edges_current_org on public.knowledge_edges
  for all to authenticated
  using (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org', true), '')::uuid);

-- Grants (match existing data-API role grants).
grant select, insert, update, delete on public.knowledge_nodes to service_role;
grant select, insert, update, delete on public.knowledge_edges to service_role;
grant select on public.knowledge_nodes, public.knowledge_edges to anon, authenticated;
