-- Add a reversal kind so "undo" can be recorded append-only in approval_decisions
-- instead of deleting history. Additive enum change; safe and backward-compatible.
alter type public.approval_decision_kind add value if not exists 'reverted';
