-- supabase/migrations/20260708130000_arc_conversation_summary.sql
-- Rolling-summary compaction for Arc chats (see docs/CHAT-CONTEXT.md). As a
-- conversation grows past the runner's verbatim-history budget, the older turns
-- are folded into `summary` instead of being dropped, and `summary_through_message_id`
-- marks the last message already summarized so folding stays incremental and
-- idempotent. The runner (the only side with model access) produces the summary
-- and persists it via POST /api/v1/arc/conversations/{id}/summary; the app injects
-- it ahead of the verbatim recent turns on the next wake.

alter table public.arc_conversations
  add column if not exists summary text,
  add column if not exists summary_through_message_id uuid;
