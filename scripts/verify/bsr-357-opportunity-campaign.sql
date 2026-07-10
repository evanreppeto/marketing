-- BSR-357 — Opportunity → Campaign conversion, DB-layer proof.
--
-- Mirrors the exact writes of createCampaignFromOpportunity (src/lib/campaigns/create.ts)
-- and markOpportunityDrafted (src/lib/opportunities/persistence.ts), then reads back as an
-- authenticated org member so RLS is enforced. Wrapped in BEGIN … ROLLBACK: it asserts and
-- persists NOTHING, so it is safe to run against a shared staging DB.
--
-- Fill in three IDs from the target DB before running:
--   :ORG_A       an org id
--   :MEMBER_A    an active organization_memberships.user_id for :ORG_A
--   :COMPANY_A   a companies.id in :ORG_A  (satisfies leads_relationship_present_check)
--
-- psql:   psql "$DATABASE_URL" -v ORG_A=... -v MEMBER_A=... -v COMPANY_A=... -f this.sql
-- Supabase MCP: inline the three IDs as literals and run via execute_sql.

begin;

insert into public.leads (id, org_id, company_id, persona, source)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', :'ORG_A', :'COMPANY_A',
        (select persona from public.leads where org_id = :'ORG_A' limit 1), 'bsr357-verify');

insert into public.opportunities
  (id, org_id, kind, subject_type, subject_id, title, summary, confidence, urgency, evidence, recommended_action, detected_by, status)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', :'ORG_A', 'cold_lead', 'lead',
        'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'Cold property-manager lead — re-engage',
        'A property-manager lead has gone cold; re-engage with a vendor packet.', 82,
        (select urgency from public.opportunities limit 1),
        jsonb_build_object('persona', (select persona::text from public.leads where id='dddddddd-dddd-4ddd-8ddd-dddddddddd01')),
        'Send a vendor packet and book a walkthrough', 'bsr357-verify', 'pending');

-- createCampaignFromOpportunity
insert into public.campaigns
  (id, org_id, name, persona, restoration_focus, status, launch_locked, owner, source_system, objective, audience_summary, lead_id, source_signal)
values ('ffffffff-ffff-4fff-8fff-ffffffffff01', :'ORG_A', 'Cold property-manager lead — re-engage',
        (select persona from public.leads where id='dddddddd-dddd-4ddd-8ddd-dddddddddd01'),
        'water_backup'::public.restoration_focus, 'draft'::public.campaign_status, true,
        'bsr357 verify', 'arc_opportunity', 'Send a vendor packet and book a walkthrough',
        'Property manager — matched by Arc from this opportunity signal.',
        'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
        jsonb_build_object('authored_by','arc','origin','opportunity',
          'opportunity_id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01','subject_type','lead',
          'subject_id','dddddddd-dddd-4ddd-8ddd-dddddddddd01','confidence',82,
          'urgency',(select urgency::text from public.opportunities limit 1),
          'recommended_action','Send a vendor packet and book a walkthrough','recommended_campaign_type',null,
          'evidence',jsonb_build_object('persona',(select persona::text from public.leads where id='dddddddd-dddd-4ddd-8ddd-dddddddddd01')),
          'outbound_locked',true));

insert into public.campaign_events (org_id, campaign_id, event_type, actor, detail)
values (:'ORG_A', 'ffffffff-ffff-4fff-8fff-ffffffffff01', 'created'::public.campaign_event_type,
        'bsr357 verify', 'Arc drafted this from an opportunity');

-- markOpportunityDrafted
update public.opportunities set status='drafted'::public.opportunity_status, campaign_id='ffffffff-ffff-4fff-8fff-ffffffffff01'
 where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' and org_id = :'ORG_A';

-- a second org + private campaign — the cross-tenant target
insert into public.organizations (id, name, slug) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01','BSR357 Verify Org B','bsr357-verify-org-b');
insert into public.campaigns (id, org_id, name, persona, restoration_focus, status, launch_locked, source_system)
values ('ffffffff-ffff-4fff-8fff-ffffffffff02','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01','Org B private campaign',
        (select persona from public.leads where id='dddddddd-dddd-4ddd-8ddd-dddddddddd01'),
        'fire'::public.restoration_focus,'draft'::public.campaign_status, true,'arc_opportunity');

-- read back as a member of org A only — RLS enforced
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'MEMBER_A', 'role','authenticated')::text, true);

select jsonb_pretty(jsonb_build_object(
  'ac2_campaign_row', (select to_jsonb(c) - 'created_at' - 'updated_at' - 'reasoning_payload' - 'audit_payload'
                         from public.campaigns c where c.id='ffffffff-ffff-4fff-8fff-ffffffffff01'),
  'ac3_created_event', (select jsonb_build_object('event_type',e.event_type,'campaign_id',e.campaign_id)
                         from public.campaign_events e where e.campaign_id='ffffffff-ffff-4fff-8fff-ffffffffff01'),
  'ac3_opportunity_flip', (select jsonb_build_object('status',o.status,'campaign_id',o.campaign_id)
                         from public.opportunities o where o.id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'),
  'rls_campA_visible', (select count(*) from public.campaigns where id='ffffffff-ffff-4fff-8fff-ffffffffff01'),  -- expect 1
  'rls_campB_visible', (select count(*) from public.campaigns where id='ffffffff-ffff-4fff-8fff-ffffffffff02'),  -- expect 0
  'rls_oppA_visible',  (select count(*) from public.opportunities where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01') -- expect 1
)) as evidence;

rollback;
