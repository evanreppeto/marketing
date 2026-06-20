-- Brand color palette + fonts for business_profiles (SP1: brand identity -> Arc).
alter table public.business_profiles
  add column if not exists brand_palette jsonb not null default '{}'::jsonb;

comment on column public.business_profiles.brand_palette is
  'Brand color palette + fonts ({primary,secondary,accent,dark,light:{label,hex}, headingFont, bodyFont}). Read into BusinessProfile.brandPalette.';
