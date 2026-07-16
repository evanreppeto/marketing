-- Journey consent (P4) — per-visitor opt-out / suppression.
--
-- Journey tracking observes real people, so a visitor must be able to say "stop,
-- and forget what you have". `POST /api/v1/journey/opt-out` sets this column and
-- DELETES that identity's journey_touchpoints (the erasure), while the identity
-- row survives as a tombstone so future collector beacons stay suppressed even
-- after the visitor clears localStorage. That retained anonymous_id is the
-- minimum needed to honor the opt-out — a suppression list, nothing more.
--
-- The workspace-level consent mode (implied | explicit | off) is NOT here: it
-- lives in the existing per-org app_settings key/value table under
-- `journey_consent_mode`, alongside the rest of the workspace config.

alter table public.journey_identities
  add column if not exists opted_out_at timestamp with time zone;

-- The collector checks suppression on every beacon that carries an anonymous_id,
-- so keep that lookup cheap.
create index if not exists journey_identities_opted_out_idx
  on public.journey_identities (org_id, anonymous_id)
  where opted_out_at is not null;
