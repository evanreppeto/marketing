## Summary

<!-- What changed and why. 2-3 bullets. -->

## Test Plan

<!-- How you verified it. -->

## Pre-merge checklist

- [ ] CI is green
- [ ] If this PR adds a file under `supabase/migrations/`, it has been (or will be) applied to the **production** Supabase DB (see `DEPLOY.md`)
- [ ] Any new env vars are set in the right place — Vercel for the app, GCP Secret Manager for the Arc runner
- [ ] Smoke-checked with `pnpm smoke:http <url>` if the change is user-facing
