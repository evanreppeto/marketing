-- Latency: the CRM table bundle and the knowledge-graph node list all run the
-- same shape — filter by org_id, then `order by updated_at desc limit N`
-- (src/lib/crm/read-model.ts getCrmTableBundle; src/lib/knowledge-graph/read-model.ts
-- listNodes). With only a single-column org_id index, Postgres has to sort the
-- entire org-filtered set before applying the LIMIT. A composite
-- (org_id, updated_at desc) index serves the filter + sort + limit directly, so
-- the read stays fast as these tables grow.
--
-- Additive and idempotent (create index if not exists). knowledge_nodes already
-- has (org_id, kind/trust_tier/persona) indexes but none on updated_at.

create index if not exists companies_org_updated_idx on public.companies (org_id, updated_at desc);
create index if not exists contacts_org_updated_idx on public.contacts (org_id, updated_at desc);
create index if not exists properties_org_updated_idx on public.properties (org_id, updated_at desc);
create index if not exists leads_org_updated_idx on public.leads (org_id, updated_at desc);
create index if not exists jobs_org_updated_idx on public.jobs (org_id, updated_at desc);
create index if not exists outcomes_org_updated_idx on public.outcomes (org_id, updated_at desc);
create index if not exists knowledge_nodes_org_updated_idx on public.knowledge_nodes (org_id, updated_at desc);
