-- The live Arc wake switch is agent_connections.enabled. Remove the earlier
-- app_settings row so Settings does not carry a second, unused webhook toggle.
delete from public.app_settings
where key = 'arc_webhook_enabled';
