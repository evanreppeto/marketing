# Arc Chat UI bugs — discovery checklist (Item C)

**Date:** 2026-06-23
**Status:** Discovery blocked locally — must run against prod or a Supabase/GCS-configured env.

## Why this is a checklist, not a confirmed bug list

Local discovery was attempted via the dev preview and could NOT surface real bugs:

1. **No `.env.local`** → the app runs Supabase-less, so `/arc` renders a degraded "Loading…" / demo state. The chat, threads, and attachment upload (which needs GCS via `createArcUploadUrlAction`) can't be exercised.
2. **The only dev server on port 6001 was already running from a different working directory** (it served `/campaigns/demo-...` seed data and its composer still showed `accept="image/*"` — i.e. pre-change code, not this worktree). So even the new attachment UI couldn't be validated there.
3. `preview_screenshot` hangs on the `/arc` particle canvas (known issue), so visual diffing needs DOM/computed-style checks instead.

The operator reports the bugs in **production**, where real data + GCS + the live runner exist. Discovery belongs there.

## Recommended discovery path

Run against the deployed branch (or a local env with `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + GCS vars set), signed in as operator. For each item below: reproduce, capture console errors + failing network calls, note severity.

## Checklist to exercise

- **Send + streaming:** send a message; does the optimistic bubble appear instantly, the composer clear, and Arc's reply stream/typewriter smoothly? Any duplicate messages, stuck "thinking", or scroll-jump?
- **Attachments (new):** attach an image, a PDF, and a `.txt`; confirm image → thumbnail, PDF/TXT → file chip; drop an unsupported file (e.g. `.mp4`) and confirm the visible error (no silent drop); paste an image; remove an attachment; send and confirm the chip renders on the sent message.
- **Threads:** create/switch/rename threads; does state leak between threads? Does the active thread persist on reload?
- **Mode / route selectors:** switch Act/Ask/Draft and the model routes; does the selection stick and affect the next turn?
- **Slash + @-mention:** open `/` commands and `@` mentions; autocomplete, keyboard nav, selection.
- **Voice input:** start/stop; does it transcribe and not get stuck "listening"?
- **Retry:** retry a failed/empty Arc turn.
- **Action cards / approval:** when Arc returns a draft card (campaign/asset), do approve/decline/revise transitions work and persist? Does media render with provenance?
- **Media generation:** ask Arc to "generate an image of X" and "make a short video of Y"; cross-reference with the `/api/v1/arc/media/diagnose?probe=1` result (Item B) — if the diagnostic says the gate/credentials are off, that's the root cause, not a UI bug.
- **Empty/error states:** Supabase briefly unreachable — do pages degrade gracefully (per the AbortError handling) or hang?

## Output

Turn confirmed repros into a fix plan (`docs/superpowers/plans/`). Do not guess-fix ambiguous items.
