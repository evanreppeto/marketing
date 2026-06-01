-- Vault notes: the editable, Supabase-persisted knowledge base behind the Vault tab.
-- Notes are raw Obsidian-format markdown with [[wiki-links]]. Reuses the shared
-- set_updated_at() trigger function defined in earlier migrations.

create type public.vault_note_status as enum (
  'draft',
  'needs_review',
  'published',
  'archived'
);

create table public.vault_notes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(btrim(slug)) > 0),
  title text not null check (length(btrim(title)) > 0),
  folder text not null check (length(btrim(folder)) > 0),
  tags text[] not null default '{}'::text[],
  author text not null default 'Operator' check (length(btrim(author)) > 0),
  status public.vault_note_status not null default 'draft',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vault_notes_slug_idx on public.vault_notes(slug);
create index vault_notes_folder_idx on public.vault_notes(folder);
create index vault_notes_status_idx on public.vault_notes(status);

alter table public.vault_notes enable row level security;

create trigger vault_notes_set_updated_at
before update on public.vault_notes
for each row execute function public.set_updated_at();

insert into public.vault_notes (slug, title, folder, tags, author, status, body) values
  (
    'emergency-homeowner-playbook',
    'Emergency Homeowner Playbook',
    'Playbooks',
    array['homeowner', 'urgent'],
    'Evan',
    'published',
    E'# Emergency Homeowner Playbook\n\nWhen an [[persona_homeowner_emergency|emergency homeowner]] reports active water, call within 15 minutes.\n\n- Reassure first, document second.\n- Request photos before the truck rolls.\n- See live example: [[basement-flooding]].\n\nRelated: [[insurance-agent-handoff]].'
  ),
  (
    'insurance-agent-handoff',
    'Insurance Agent Handoff',
    'Playbooks',
    array['partner', 'coverage-neutral'],
    'Mark',
    'needs_review',
    E'# Insurance Agent Handoff\n\nGive the [[persona_insurance_agent|insurance agent]] a coverage-neutral path to refer a client.\n\nNever promise coverage. Lead with documentation.\n\nPartner record: [[north-branch-insurance]].'
  ),
  (
    'apex-plumbing-co-intel',
    'Apex Plumbing Co. — Partner Intel',
    'Partner Intel',
    array['partner', 'plumbing'],
    'Mark',
    'draft',
    E'# Apex Plumbing Co. — Partner Intel\n\n[[apex-plumbing-co]] stops the source and hands off property damage.\n\nBest channel: email then phone. Tie referrals to the [[emergency-homeowner-playbook]].\n\nTODO: confirm the owner''s after-hours contact (link target [[apex-after-hours]] not imported yet).'
  ),
  (
    'coverage-neutral-language-sop',
    'Coverage-Neutral Language SOP',
    'SOPs',
    array['compliance'],
    'Evan',
    'published',
    E'# Coverage-Neutral Language SOP\n\nApplies to every message aimed at the [[persona_insurance_agent|insurance agent]] persona.\n\n- No coverage promises.\n- No claim-approval language.\n- Used by [[insurance-agent-handoff]].'
  );
