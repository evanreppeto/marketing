# Local Sandbox

A throwaway, fully local copy of the app you can poke before opening a PR —
your own `docker compose up`. Real Postgres, real auth, real approval flow,
seeded with a fake tenant. **Zero LLM cost, zero external sends, never touches
a real project.**

```bash
pnpm sandbox:up     # one-time-ish: bring up local Supabase + migrate + seed
pnpm sandbox        # everyday: run the app (:6001) + a fake Arc that answers chats
```

Open **http://127.0.0.1:6001** and click around. Ask Arc to "find opportunities"
or "draft a campaign" and watch a package land in the approval queue.

---

## What you get

| Piece | What it is |
|---|---|
| **Local Supabase** | Postgres + Auth + Storage + Studio in Docker (`supabase start`). Studio at http://127.0.0.1:54323. |
| **Seeded fake tenant** | Big Shoulders Restoration — CRM, campaigns, personas, brand brain, analytics, opportunities, media, outbox. |
| **The app** | Your uncommitted working tree, on http://127.0.0.1:6001. |
| **Fake Arc worker** | A local script that makes Arc chat actually respond — with a live step timeline and scripted, in-character replies. No LLM. |

Seeded logins (auth is open by default, but these work if you enable the login wall):

- `owner@bsr.test` / `BsrOwner1234!`
- `teammate@bsr.test` / `BsrTeam1234!`

---

## Requirements

- **Docker** running (Docker Desktop). It's the only prerequisite — the Supabase
  CLI is fetched on demand via `pnpm dlx`, nothing to install globally.

---

## Commands

| Command | Does |
|---|---|
| `pnpm sandbox:up` | Start local Supabase, point `.env.local` at it, apply migrations, seed the tenant. Idempotent. |
| `pnpm sandbox` | Run the Next app **and** the fake Arc worker together (Ctrl-C stops both). |
| `pnpm sandbox:seed` | Re-run the seeds (upserts; safe to repeat). |
| `pnpm sandbox:reset` | Wipe the DB, re-apply all migrations, re-seed. Clean slate. |
| `pnpm sandbox:down` | Stop the stack and restore your previous `.env.local`. |
| `pnpm sandbox:arc` | Run just the fake Arc worker (if you're running the app another way). |

---

## Why it's safe

Arc chat in the sandbox goes through the exact same bearer-gated inbox the real
runner uses — `GET`/`POST /api/v1/arc/messages`. That surface **only records a
chat reply**; it structurally cannot send, publish, launch, or spend (enforced
by `src/app/api/v1/arc/__tests__/safety.test.ts`). So the fake worker can talk
all day and never reach the outside world. Every campaign it "drafts" lands as
an approval-gated record you approve/decline/revise — the real flow.

---

## Notes & knobs

- **`.env.local` is managed.** `sandbox:up` backs up your existing file to
  `.env.local.pre-sandbox` and `sandbox:down` restores it. Both are gitignored.
- **Real data, not fallbacks.** The sandbox sets `ARC_DEMO_DATA=0` so what you
  see is the seeded database, and an empty surface means a seed is missing (an
  honest signal). Set `ARC_DEMO_DATA=1` in `.env.local` if you'd rather nothing
  ever looks empty for a demo.
- **A seed failed?** `sandbox:up` continues past optional seeds and prints a
  summary. Re-run a single one with e.g. `node scripts/seed-personas.mjs`, or
  re-run all with `pnpm sandbox:seed`.
- **Want real Arc (a live model) instead of the fake worker?** Run the app with
  `pnpm dev --port 6001`, point `ARC_RUNNER_URL` at a locally-running
  `apps/arc-runner`, and don't start `pnpm sandbox:arc`. The fake worker is only
  for cost-free, deterministic play.
- **Teardown that frees disk:** `pnpm sandbox:down` keeps the DB volume so the
  next `up` is fast. To remove it entirely, `supabase stop --no-backup`.

---

## Extending it

- **New scripted Arc replies:** add an intent to the `INTENTS` array in
  `scripts/sandbox/fake-arc.mjs` (keyword matcher + steps + reply).
- **Richer seed data:** add a `scripts/seed-*.mjs` and list it in
  `scripts/sandbox/seed-all.mjs`.
- **Automated flows on top of this:** the same seeded local stack is the natural
  substrate for Playwright E2E (`pnpm test:e2e`) — e.g. "sign in → approve a
  campaign → assert nothing sent."
