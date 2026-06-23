-- Folder purpose/description so Arc (and operators) understand what belongs in
-- each Library folder. Nullable; existing folders keep a null description.
alter table public.media_folders
  add column description text;
