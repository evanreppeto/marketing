-- CRM dedup guards: merge existing duplicate contacts/properties, then add
-- partial unique indexes so duplicates cannot slip in on an app-layer miss.
-- App-layer find-or-create (record-writes.ts) is primary; these are backstops.

-- 1. Contacts: collapse duplicate (org_id, lower(email)). Relink child rows to
--    the survivor (earliest created_at) before deleting the duplicates.
with ranked as (
  select id, org_id, lower(btrim(email)) as email_key,
         row_number() over (
           partition by org_id, lower(btrim(email))
           order by created_at asc, id asc
         ) as rn
  from public.contacts
  where email is not null and btrim(email) <> ''
),
survivors as (select org_id, email_key, id as keep_id from ranked where rn = 1),
dupes as (
  select r.id as dup_id, s.keep_id
  from ranked r
  join survivors s on s.org_id = r.org_id and s.email_key = r.email_key
  where r.rn > 1
)
update public.leads l set contact_id = d.keep_id
from dupes d where l.contact_id = d.dup_id;

with ranked as (
  select id, org_id, lower(btrim(email)) as email_key,
         row_number() over (partition by org_id, lower(btrim(email)) order by created_at asc, id asc) as rn
  from public.contacts where email is not null and btrim(email) <> ''
),
survivors as (select org_id, email_key, id as keep_id from ranked where rn = 1),
dupes as (
  select r.id as dup_id, s.keep_id from ranked r
  join survivors s on s.org_id = r.org_id and s.email_key = r.email_key where r.rn > 1
)
update public.properties p set contact_id = d.keep_id
from dupes d where p.contact_id = d.dup_id;

with ranked as (
  select id, org_id, lower(btrim(email)) as email_key,
         row_number() over (partition by org_id, lower(btrim(email)) order by created_at asc, id asc) as rn
  from public.contacts where email is not null and btrim(email) <> ''
)
delete from public.contacts c using ranked r where c.id = r.id and r.rn > 1;

create unique index if not exists contacts_org_email_unique_idx
  on public.contacts (org_id, lower(btrim(email)))
  where email is not null and btrim(email) <> '';

-- 2. Properties: collapse duplicate (org_id, lower(street_line_1), postal_code).
with ranked as (
  select id, org_id, lower(btrim(street_line_1)) as street_key, postal_code,
         row_number() over (
           partition by org_id, lower(btrim(street_line_1)), postal_code
           order by created_at asc, id asc
         ) as rn
  from public.properties
),
survivors as (select org_id, street_key, postal_code, id as keep_id from ranked where rn = 1),
dupes as (
  select r.id as dup_id, s.keep_id from ranked r
  join survivors s on s.org_id = r.org_id and s.street_key = r.street_key and s.postal_code = r.postal_code
  where r.rn > 1
)
update public.leads l set property_id = d.keep_id
from dupes d where l.property_id = d.dup_id;

with ranked as (
  select id, org_id, lower(btrim(street_line_1)) as street_key, postal_code,
         row_number() over (partition by org_id, lower(btrim(street_line_1)), postal_code order by created_at asc, id asc) as rn
  from public.properties
)
delete from public.properties p using ranked r where p.id = r.id and r.rn > 1;

create unique index if not exists properties_org_address_unique_idx
  on public.properties (org_id, lower(btrim(street_line_1)), postal_code);
