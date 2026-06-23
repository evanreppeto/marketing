-- Arc chat & project sharing + tenancy.
-- Adds org/workspace/owner scoping and per-user/workspace sharing to Arc
-- conversations and projects. Private-by-default. Enforcement is primarily
-- app-layer (service role bypasses RLS); these policies are defense-in-depth.

-- 1. Tenancy + ownership + visibility on conversations.
alter table public.arc_conversations
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'workspace')),
  add column if not exists workspace_permission text not null default 'view'
    check (workspace_permission in ('view', 'collaborate'));

-- 2. Tenancy + authorship on messages (denormalized for RLS + collaborator attribution).
alter table public.arc_messages
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists author_user_id uuid references auth.users(id) on delete set null;

-- 3. Tenancy + ownership + visibility on projects.
alter table public.arc_projects
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'workspace')),
  add column if not exists workspace_permission text not null default 'view'
    check (workspace_permission in ('view', 'collaborate'));

-- 4. Workspace consistency for saved items (visibility inherited from the project).
alter table public.arc_saved_items
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- 5. Per-user share rows.
create table if not exists public.arc_conversation_shares (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.arc_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'view' check (permission in ('view', 'collaborate')),
  shared_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table if not exists public.arc_project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'view' check (permission in ('view', 'collaborate')),
  shared_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

-- 6. Indexes for the read model.
create index if not exists arc_conversations_owner_idx
  on public.arc_conversations (owner_id, last_message_at desc);
create index if not exists arc_conversations_workspace_visibility_idx
  on public.arc_conversations (workspace_id, visibility);
create index if not exists arc_conversation_shares_user_idx
  on public.arc_conversation_shares (user_id);
create index if not exists arc_project_shares_user_idx
  on public.arc_project_shares (user_id);

-- 7. Backfill existing rows to the default org + default workspace (BSR).
update public.arc_conversations c
set org_id = w.org_id, workspace_id = w.id
from public.workspaces w
join public.organizations o on o.id = w.org_id
where w.key = 'default'
  and o.slug = 'big-shoulders-restoration'
  and c.workspace_id is null;

update public.arc_projects p
set org_id = w.org_id, workspace_id = w.id
from public.workspaces w
join public.organizations o on o.id = w.org_id
where w.key = 'default'
  and o.slug = 'big-shoulders-restoration'
  and p.workspace_id is null;

-- Owner = the workspace owner membership (the `operator` text is not a user).
-- ASSUMPTION (confirm before prod): a single human operator per workspace.
update public.arc_conversations c
set owner_id = m.user_id
from public.workspace_memberships m
where m.workspace_id = c.workspace_id
  and m.role = 'owner'
  and m.status = 'active'
  and m.user_id is not null
  and c.owner_id is null;

update public.arc_projects p
set owner_id = m.user_id
from public.workspace_memberships m
where m.workspace_id = p.workspace_id
  and m.role = 'owner'
  and m.status = 'active'
  and m.user_id is not null
  and p.owner_id is null;

-- Messages inherit tenancy from their conversation.
update public.arc_messages msg
set org_id = c.org_id, workspace_id = c.workspace_id
from public.arc_conversations c
where c.id = msg.conversation_id
  and msg.workspace_id is null;

update public.arc_saved_items s
set workspace_id = p.workspace_id
from public.arc_projects p
where p.id = s.project_id
  and s.workspace_id is null;

-- 8. RLS (defense-in-depth; the app reads via service role which bypasses this).
alter table public.arc_conversations enable row level security;
alter table public.arc_messages enable row level security;
alter table public.arc_projects enable row level security;
alter table public.arc_conversation_shares enable row level security;
alter table public.arc_project_shares enable row level security;

create policy arc_conversations_viewer_select on public.arc_conversations for select
to authenticated using (
  owner_id = (select auth.uid())
  or (visibility = 'workspace' and (select app_private.is_workspace_member(workspace_id)))
  or exists (
    select 1 from public.arc_conversation_shares s
    where s.conversation_id = id and s.user_id = (select auth.uid())
  )
);

create policy arc_conversations_owner_write on public.arc_conversations for all
to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy arc_messages_viewer_select on public.arc_messages for select
to authenticated using (
  exists (
    select 1 from public.arc_conversations c
    where c.id = conversation_id
      and (
        c.owner_id = (select auth.uid())
        or (c.visibility = 'workspace' and (select app_private.is_workspace_member(c.workspace_id)))
        or exists (
          select 1 from public.arc_conversation_shares s
          where s.conversation_id = c.id and s.user_id = (select auth.uid())
        )
      )
  )
);

create policy arc_projects_viewer_select on public.arc_projects for select
to authenticated using (
  owner_id = (select auth.uid())
  or (visibility = 'workspace' and (select app_private.is_workspace_member(workspace_id)))
  or exists (
    select 1 from public.arc_project_shares s
    where s.project_id = id and s.user_id = (select auth.uid())
  )
);

create policy arc_projects_owner_write on public.arc_projects for all
to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy arc_conversation_shares_select on public.arc_conversation_shares for select
to authenticated using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.arc_conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  )
);

create policy arc_conversation_shares_owner_write on public.arc_conversation_shares for all
to authenticated using (
  exists (
    select 1 from public.arc_conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  )
) with check (
  exists (
    select 1 from public.arc_conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  )
);

create policy arc_project_shares_select on public.arc_project_shares for select
to authenticated using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.arc_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
);

create policy arc_project_shares_owner_write on public.arc_project_shares for all
to authenticated using (
  exists (
    select 1 from public.arc_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
) with check (
  exists (
    select 1 from public.arc_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
);
