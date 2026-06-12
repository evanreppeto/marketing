-- Workspace profile and chat-agent behavior preferences.
insert into public.app_settings (key, value)
values
  ('workspace_profile',          '"company"'::jsonb),
  ('assistant_tone',             '"direct"'::jsonb),
  ('assistant_response_style',   '"balanced"'::jsonb),
  ('approval_strictness',        '"standard"'::jsonb)
on conflict (key) do nothing;
