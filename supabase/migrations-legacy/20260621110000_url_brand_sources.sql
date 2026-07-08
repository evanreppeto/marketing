-- Public URL imports for brand knowledge sources.
-- Imported pages are copied into media_assets as text assets so Arc can learn
-- from them through the same Library -> Brain pipeline as uploaded files.

alter table public.media_assets
  drop constraint if exists media_assets_source_check;

alter table public.media_assets
  add constraint media_assets_source_check
  check (source in ('uploaded','ai_generated','composite','stock','external','google_drive','url'));
