create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code_hash text not null unique check (length(btrim(code_hash)) = 64),
  invited_email text,
  role text not null default 'member'
    check (role in ('admin', 'marketer', 'reviewer', 'member', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'used', 'revoked')),
  expires_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_invites_workspace_status_idx
  on public.workspace_invites(workspace_id, status);

create index if not exists workspace_invites_invited_email_idx
  on public.workspace_invites(lower(invited_email))
  where invited_email is not null;

drop trigger if exists workspace_invites_set_updated_at on public.workspace_invites;
create trigger workspace_invites_set_updated_at
before update on public.workspace_invites
for each row execute function public.set_updated_at();

alter table public.workspace_invites enable row level security;

drop policy if exists workspace_invites_admin_select on public.workspace_invites;
create policy workspace_invites_admin_select
on public.workspace_invites for select
to authenticated
using ((select app_private.is_org_admin(org_id)));

drop policy if exists workspace_invites_admin_write on public.workspace_invites;
create policy workspace_invites_admin_write
on public.workspace_invites for all
to authenticated
using ((select app_private.is_org_admin(org_id)))
with check ((select app_private.is_org_admin(org_id)));

grant select, insert, update, delete on public.workspace_invites to authenticated;
grant select, insert, update, delete on public.workspace_invites to service_role;
