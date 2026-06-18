# Operator-selectable Media Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A `/settings` "Media models" section lets the operator pick Arc's image model (Imagen 4 / Ultra / Nano Banana) and video model (Veo 2 / Veo 3). Resolution: stored → env → built-in default. No DB migration.

**Architecture:** Two new `app_settings` keys (`image_model`/`video_model`, value `""` = Auto) via the wired settings store; `createGeminiMediaProvider(key, { imageModel, videoModel })` uses them; `getMediaProvider(settings?)` resolves + passes; the two generate routes fetch settings; a new Settings section + form + action mirror the existing agent-behavior pattern.

**Tech Stack:** Next.js server components + server actions + Supabase `app_settings` (k/v); Vitest.

Spec: `docs/superpowers/specs/2026-06-17-media-model-settings-design.md`.

---

## Task 1: Settings store — image/video model prefs

**Files:** Modify `src/lib/settings/store.ts` (+ a test, e.g. `src/lib/settings/__tests__/media-models.test.ts` or co-located).

- [ ] **Step 1: Read `src/lib/settings/store.ts`** — note `AppSettings`, `DEFAULT_APP_SETTINGS`, an existing string-enum validator (e.g. `appAssistantTone`), and `mergeAppSettingsRows` (how it maps `app_settings` keys → fields, e.g. `assistant_tone` → `assistantTone`).

- [ ] **Step 2:** Add allow-list consts + validators near the other validators:
```ts
export const IMAGE_MODELS = ["imagen-4.0-generate-001", "imagen-4.0-ultra-generate-001", "gemini-2.5-flash-image"] as const;
export const VIDEO_MODELS = ["veo-2.0-generate-001", "veo-3.0-generate-001"] as const;

/** "" = Auto (inherit env/default). Otherwise must be an allow-listed id. */
export function appImageModel(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  return v === "" || (IMAGE_MODELS as readonly string[]).includes(v) ? v : "";
}
export function appVideoModel(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  return v === "" || (VIDEO_MODELS as readonly string[]).includes(v) ? v : "";
}
```

- [ ] **Step 3:** Add `imageModel: string` + `videoModel: string` to the `AppSettings` type; add `imageModel: ""`, `videoModel: ""` to `DEFAULT_APP_SETTINGS`; in `mergeAppSettingsRows` map the rows (mirror how `assistant_tone` is mapped):
```ts
imageModel: appImageModel(rows.image_model),   // adapt to the real row-access shape in mergeAppSettingsRows
videoModel: appVideoModel(rows.video_model),
```
(Use the exact access pattern the function already uses for other keys — it may read from a `Record` or a `.find`.)

- [ ] **Step 4: Test** (mirror any existing store test; if none, create one) — `appImageModel`/`appVideoModel` accept each allow-listed id and `""`, and reject junk (`"foo"`, numbers, null) → `""`.

- [ ] **Step 5: tsc + commit** — `pnpm exec tsc --noEmit` → clean. `git add src/lib/settings && git commit -m "feat(settings): image_model + video_model prefs (validated, default Auto)"`

---

## Task 2: Provider resolves stored → env → default

**Files:** Modify `src/lib/media/gemini.ts`, `src/lib/media/index.ts`, `src/app/api/v1/arc/media/generate-image/route.ts`, `src/app/api/v1/arc/media/generate-video/route.ts`. Add `src/lib/media/__tests__/resolve.test.ts`.

- [ ] **Step 1: `gemini.ts`** — make the provider take optional model overrides; the closure picks `override || resolve<env→default>()`:
```ts
export function createGeminiMediaProvider(
  apiKey: string,
  opts?: { imageModel?: string; videoModel?: string },
): MediaProvider {
  const ai = new GoogleGenAI({ apiKey });
  const imageModel = opts?.imageModel?.trim() || resolveImageModel();
  const videoModel = opts?.videoModel?.trim() || resolveVideoModel();
  return {
    async generateImage(input: ImageGenInput): Promise<GeneratedMedia> {
      const model = imageModel; // was: resolveImageModel()
      // ... unchanged
    },
    async startVideo(input: VideoGenInput): Promise<VideoStart> {
      const model = videoModel; // was: resolveVideoModel()
      // ... unchanged
    },
    async pollVideo(operationName: string): Promise<VideoPoll> { /* unchanged */ },
  };
}
```
(Keep `resolveImageModel`/`resolveVideoModel` as the env→default fallback — now only used when no override is passed. Replace the in-method `resolveImageModel()`/`resolveVideoModel()` calls with the closure consts `imageModel`/`videoModel`.)

- [ ] **Step 2: `index.ts`** — `getMediaProvider` accepts optional settings and resolves stored → env → default:
```ts
import { createGeminiMediaProvider } from "./gemini";
import type { MediaProvider } from "./types";

export type MediaModelPrefs = { imageModel?: string; videoModel?: string };

export function isMediaGenEnabled(): boolean {
  return process.env.ARC_MEDIA_ENABLED === "1" && Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** Active provider, or null when disabled. `prefs` are the operator-selected
 *  models (""/undefined = inherit env/default). */
export function getMediaProvider(prefs?: MediaModelPrefs): MediaProvider | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (process.env.ARC_MEDIA_ENABLED !== "1" || !key) return null;
  return createGeminiMediaProvider(key, {
    imageModel: prefs?.imageModel || undefined, // "" falls through to env/default in the provider
    videoModel: prefs?.videoModel || undefined,
  });
}
```

- [ ] **Step 3: routes** — both generate routes fetch settings and pass the prefs. In `generate-image/route.ts` and `generate-video/route.ts`, where they currently call `getMediaProvider()`:
```ts
import { getAppSettings } from "@/lib/settings/store";
// ...
const settings = await getAppSettings();
const provider = getMediaProvider({ imageModel: settings.imageModel, videoModel: settings.videoModel });
```
(Place the `getAppSettings()` read after the `isMediaGenEnabled()` check.)

- [ ] **Step 4: Test** `src/lib/media/__tests__/resolve.test.ts` — verify precedence WITHOUT real Google calls by testing the resolution logic. Simplest: test `getMediaProvider`’s model wiring indirectly is hard (provider is opaque). Instead, export a tiny pure helper from index.ts, `resolveModel(stored, env, def)` = `stored || env || def`, and unit-test it (stored wins; env when stored ""; def when both empty). Use it inside `createGeminiMediaProvider`’s fallback too if convenient. (Pragmatic: a pure resolver is the testable seam.)

- [ ] **Step 5: tsc + commit** — `pnpm exec tsc --noEmit` → clean; `pnpm test src/lib/media` → pass; `git add src/lib/media src/app/api/v1/arc/media && git commit -m "feat(media): resolve image/video model from settings (stored -> env -> default)"`

---

## Task 3: Settings "Media models" section (UI + action)

**Files:** Modify `src/app/settings/settings-sections.ts`, `src/app/settings/page.tsx` (panels map), `src/app/settings/settings-forms.tsx` (or a new `media-settings.tsx`), `src/app/settings/app-settings-actions.ts`.

- [ ] **Step 1: Read** `settings-sections.ts`, how `page.tsx` maps a section id → panel component, the existing `AgentBehaviorSettings` panel + `AgentBehaviorSettingsForm` + `saveAgentBehaviorSettingsAction` (the exact `useActionState` + `<select>` + `SettingsSection` + save-action shapes to mirror).

- [ ] **Step 2:** Add the section: in `settings-sections.ts` add `{ id: "media", label: "Media models", description: "Choose the image and video models Arc generates with." }` (match the existing entry shape).

- [ ] **Step 3: Action** in `app-settings-actions.ts` (mirror `saveAgentBehaviorSettingsAction`):
```ts
export async function saveMediaModelsAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED; // use the file's existing not-configured constant/shape
  const imageModel = appImageModel(formData.get("imageModel"));
  const videoModel = appVideoModel(formData.get("videoModel"));
  try {
    await saveAppSettings(getSupabaseAdminClient(), { image_model: imageModel, video_model: videoModel });
  } catch {
    return { ok: false, message: "Couldn't save media models." };
  }
  revalidatePath("/settings");
  revalidatePath("/arc");
  return { ok: true, message: "Media models saved." };
}
```
(Import `appImageModel`/`appVideoModel` from the settings store; match the file's `SettingsActionState` + not-configured constant.)

- [ ] **Step 4: Panel + form.** Add a server panel `MediaModelsSettings` (loads `getAppSettings()`) + a client `MediaModelsForm` mirroring `AgentBehaviorSettingsForm` (`useActionState(saveMediaModelsAction, null)`), with two `<select>`s using the existing form/select styling:
  - Image: `<option value="">Auto (recommended)</option>` + `imagen-4.0-generate-001` "Imagen 4", `imagen-4.0-ultra-generate-001` "Imagen 4 Ultra (max quality)", `gemini-2.5-flash-image` "Gemini Nano Banana (editing/reference)". `defaultValue={initialImageModel}`.
  - Video: `<option value="">Auto (recommended)</option>` + `veo-2.0-generate-001` "Veo 2", `veo-3.0-generate-001` "Veo 3". `defaultValue={initialVideoModel}`.
  Render via `SettingsSection` with title "Media models"; include the save button + feedback exactly like the agent-behavior form. Wire the panel into `page.tsx`'s section→component map under `media`.

- [ ] **Step 5: tsc + lint + commit** — `pnpm exec tsc --noEmit` → clean; `pnpm exec eslint src/app/settings` → clean; `git add src/app/settings && git commit -m "feat(settings): Media models section (image + video model pickers)"`

---

## Task 4: Manual acceptance
- [ ] `/settings` shows a **Media models** section with two dropdowns defaulting to **Auto**.
- [ ] Pick **Imagen 4 Ultra**, save → generate an image (flag + key on) → the draft asset's `media.model` is `imagen-4.0-ultra-generate-001`.
- [ ] Set back to **Auto** → generation uses `GEMINI_IMAGE_MODEL` if set, else `imagen-4.0-generate-001`.
- [ ] Pick **Veo 2** → a generated video uses it; **Auto** → env/default. (Confirm the real Veo 3 id before relying on that option; Veo 2 is verified.)
- [ ] Existing deploys with only the env vars set and no stored pick keep working unchanged.

---

## Self-review notes
- **Spec coverage:** store prefs + validators (T1); provider resolution stored→env→default + routes (T2); Settings section UI + action (T3); manual (T4). No migration (k/v `app_settings`). LLM route selector + generation flow + guardrails untouched.
- **Type/name consistency:** `appImageModel`/`appVideoModel` + `AppSettings.imageModel/videoModel` (store) → `getMediaProvider({imageModel,videoModel})` → `createGeminiMediaProvider(key, opts)` → `media.model` on the asset. `""` = Auto throughout.
- **Reuse:** wired `app_settings` store + `saveAppSettings`; the agent-behavior section/form/action pattern; the existing provider (only the model source changes).
- **Build-time confirms:** exact `mergeAppSettingsRows` access shape; the real `SettingsActionState`/not-configured constant; the Veo 3 model id; a pure `resolveModel` seam for testing.
- **Deferred:** per-generation model override (Arc/operator picks a model for one image); per-org scoping (app_settings is global today).
