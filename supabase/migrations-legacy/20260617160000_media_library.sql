-- Media Library: per-org uploaded/organized media that operators hand to Arc.
-- Industry-agnostic. Isolation enforced in the app layer via the service-role
-- client; RLS enabled as defense-in-depth (mirrors brand_kit_foundation).

create table public.media_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  parent_id uuid references public.media_folders(id) on delete set null, -- reserved; flat in v1
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger media_folders_set_updated_at
  before update on public.media_folders
  for each row execute function public.set_updated_at();

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  folder_id uuid references public.media_folders(id) on delete set null,
  file_name text not null check (length(btrim(file_name)) > 0),
  storage_path text not null,
  public_url text not null,
  content_type text not null,
  kind text not null check (kind in ('image', 'video', 'logo', 'document')),
  width integer,
  height integer,
  byte_size bigint,
  duration_seconds numeric,
  source text not null default 'uploaded'
    check (source in ('uploaded', 'ai_generated', 'composite', 'stock', 'external')),
  provenance jsonb not null default '{}'::jsonb,
  risk_flags text[] not null default '{}',
  tags text[] not null default '{}',
  available_to_arc boolean not null default true,
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_assets_org_idx on public.media_assets (org_id, created_at desc);
create index media_assets_folder_idx on public.media_assets (folder_id);

create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row execute function public.set_updated_at();

alter table public.media_folders enable row level security;
alter table public.media_assets enable row level security;

grant select, insert, update, delete on public.media_folders to service_role;
grant select, insert, update, delete on public.media_assets to service_role;
grant select on public.media_folders, public.media_assets to anon, authenticated;
