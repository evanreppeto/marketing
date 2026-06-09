-- Ensure the public Storage bucket operator-authored campaign photos (and Mark's
-- social-ad images) upload to exists. Idempotent — safe if the bucket was already
-- created manually in the Supabase project.
insert into storage.buckets (id, name, public)
values ('campaign-media', 'campaign-media', true)
on conflict (id) do nothing;
