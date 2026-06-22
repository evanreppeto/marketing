alter table public.media_folders
  add column if not exists color text;

alter table public.media_folders
  drop constraint if exists media_folders_color_hex;

alter table public.media_folders
  add constraint media_folders_color_hex
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
