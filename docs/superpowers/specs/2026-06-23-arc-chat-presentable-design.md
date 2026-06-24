# Arc Chat: presentable + real attachments + media-gen diagnosis

**Date:** 2026-06-23
**Status:** Approved (design)

## Problem

Operator reports the Arc chat is buggy and unpresentable. Three concrete complaints:

1. **File upload "only takes images."** Confirmed hardcoded image-only in 5 places. Worse: even uploaded images are **never passed to the model** — the live TS runner builds a text-only prompt (`apps/arc-runner/src/arc.ts:170`) and `attachments` (`unknown[]`) is dropped. Attachments are display-only today.
2. **Image gen "sucks", no videos.** The code is **fully wired** — `generate_image` (Gemini/Imagen) and `generate_video` (Veo) both exist, approval-gated, with system-prompt instructions. Gated by `ARC_MEDIA_ENABLED=1` + a `GEMINI_API_KEY` with Imagen/Veo access. In **production** the failure is almost certainly config/credentials, not code.
3. **"So many bugs" in the chat UI.** Vague — needs a discovery pass to enumerate real broken behaviors.

## Non-goals

- `.docx/.xlsx` upload support (needs server-side conversion; follow-up).
- Changing/enabling Higgsfield (stays operationally off).
- Any outbound/auto-send behavior. All media stays approval-gated.
- Touching the legacy Python `arc-runner/` dir (dead; live runner is TS `apps/arc-runner/`).

## Design

### Item A — Real multimodal attachments

Accepted types: images (jpeg/png/gif/webp), PDF, plain text (txt/md/csv) — all natively readable by Claude (the runner's model).

- **Frontend** (`src/app/arc/_components/composer.tsx`): widen `accept`; replace silent `startsWith("image/")` skips with a typed allowlist + visible error for unsupported files; fix paste + drag handlers and the "Drop image" label.
- **Server** (`src/app/arc/actions.ts`): widen `createArcUploadUrlAction` content-type allowlist to match.
- **Runner** (`apps/arc-runner/src/arc.ts`): build a structured user message (text + image/document content blocks sourced from attachment URLs) instead of a text-only prompt, so Arc actually sees attachments. Verify the Claude Agent SDK multimodal input shape against `node_modules` first (per AGENTS.md) — this is the one real implementation risk.
- **Rendering** (`src/app/arc/_components/message-list.tsx`): render non-image attachments as a file chip (icon + name), not a broken `<img>`.

### Item B — Media-gen prod diagnosis

- Inspect Vercel project config via MCP (presence of vars, build/runtime errors).
- Ship `GET /api/v1/arc/media/diagnose` (operator/bearer-gated, leaks no secrets): reports `mediaEnabled` flag, `geminiKeyPresent` bool, resolved image/video model IDs, and an optional tiny live image-gen + video-start probe to confirm Imagen/Veo access — sanitized success/error.
- Prod env changes are the operator's to make; diagnostics tells us exactly what's wrong.

### Item C — UI polish

Discovery-first: run the preview, drive Arc chat, enumerate concrete bugs, bring the list to the operator, then fix the clear ones.

## Sequence

A → B → C. A is largest; B is fast/high-information; C is a discovery pass.
