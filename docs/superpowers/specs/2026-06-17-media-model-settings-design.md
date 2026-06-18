# Operator-selectable media models — design

**Date:** 2026-06-17
**Status:** Approved (placement = dedicated Settings section), pending spec review
**Scope:** Let the operator choose Arc's **image model** (Imagen 4 / Imagen 4 Ultra / Gemini Nano Banana) and **video model** (Veo 2 / Veo 3) from a new **Media models** section in `/settings`, instead of the current env-only `GEMINI_IMAGE_MODEL` / `GEMINI_VIDEO_MODEL`. Workspace-level default (not per-message). No DB migration.

## Goal
Operators pick quality/cost per model type in the UI; the choice persists and Arc's generate endpoints use it. Env vars remain a deploy-time fallback. Nothing else changes (LLM route selector, generation flow, guardrails all untouched).

## Resolution order
`stored setting → env → built-in default`. Implemented with the stored value being `""` = **"Auto"** (inherit env/default). So `getMediaProvider` resolves `settings.imageModel || process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL` — empty/auto falls through cleanly, and an explicit pick wins.

## Architecture (reuses wired infra; no migration)
### 1. Settings store — `src/lib/settings/store.ts`
Add to `AppSettings`: `imageModel: string` + `videoModel: string` (default `""` = Auto). Add validators `appImageModel(v)` / `appVideoModel(v)` that accept `""` or an allow-listed model id, else fall back to `""`. Map the `app_settings` keys `image_model` / `video_model` in `mergeAppSettingsRows`. (Key/value table — no schema change.)

**Allow-listed ids:**
- Image: `imagen-4.0-generate-001`, `imagen-4.0-ultra-generate-001`, `gemini-2.5-flash-image`.
- Video: `veo-2.0-generate-001`, `veo-3.0-generate-001` (Veo 3 id confirmed at build/test; invalid ids just fail generation gracefully, and Auto/Veo 2 is the safe default).

### 2. Provider — `src/lib/media/gemini.ts` + `src/lib/media/index.ts`
Refactor `createGeminiMediaProvider(apiKey, opts?: { imageModel?: string; videoModel?: string })` to use the passed model (falling back to the built-in default), replacing the internal env-reading `resolveImageModel`/`resolveVideoModel`. `getMediaProvider(settings?: AppSettings)` resolves `settings.imageModel || env || default` (same for video) and passes them in. Back-compat: `getMediaProvider()` with no args still resolves env→default (so any existing caller works).

### 3. Generate routes
`generate-image` and `generate-video` routes call `getAppSettings()` and pass it to `getMediaProvider(settings)`. (Two ~2-line edits.)

### 4. UI — new `/settings` "Media models" section
Add `{ id: "media", label: "Media models" }` to `settings-sections.ts`; a server `MediaSettings` panel that loads `getAppSettings()`; a client `MediaSettingsForm` with two `<select>`s (each with an "Auto (recommended)" = `""` option + the model options, friendly labels); a `saveMediaSettingsAction` mirroring `saveAgentBehaviorSettingsAction` (`requireOperator` + `isSupabaseAdminConfigured` + `saveAppSettings({ image_model, video_model })` + `revalidatePath`). Off-by-default media (the flag) is unrelated; if media gen is disabled, the section still shows the picker (it just won't generate until enabled).

## Testing
- **Store:** validators (`appImageModel`/`appVideoModel`) accept allow-listed ids + `""`, reject junk → `""`; merge maps `image_model`/`video_model`.
- **Provider:** `getMediaProvider` precedence — stored wins over env; env used when stored is `""`; default when both empty. (Unit test the resolution with a fake settings object + env.)
- **Action:** `saveMediaSettingsAction` persists validated values (mock `saveAppSettings`).
- **Manual:** Settings → Media models → pick Imagen 4 Ultra → generate an image → the asset's `media.model` reflects the choice; pick "Auto" → falls back to env/default.

## Acceptance criteria
1. A Media models settings section lets the operator pick image + video models (incl. "Auto"); the choice persists.
2. Generation uses the stored model; "Auto"/unset falls back to env then built-in default; existing env-only deploys keep working unchanged.
3. Invalid/stale stored values are ignored (validated to "" → Auto). No migration. No change to guardrails or the LLM route selector.

## Open items for the plan stage
- Confirm the exact Veo 3 model id (default stays Veo 2 / Auto).
- Confirm `mergeAppSettingsRows` + the validators' exact spots in `store.ts` (mirror an existing field like `assistant_tone`).
- Mirror the `saveAgentBehaviorSettingsAction` + `AgentBehaviorSettingsForm` shape for the new action/form.
