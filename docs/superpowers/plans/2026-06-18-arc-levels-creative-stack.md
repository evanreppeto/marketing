# Arc Levels (Swift / Studio) — bundle the creative stack

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Replace the bland "Fast/Standard" route names with **Swift / Studio** levels, where the level bundles the whole creative stack: a higher level = deeper LLM **and** better image (Imagen Ultra) **and** better video (Veo 3). The level picker already lives in the chat (composer pill + agent settings); raw per-model dropdowns become an **Advanced override**.

**Architecture:** Keep the underlying `ArcRoute` enum (`"fast"|"standard"`) — only relabel in the UI. A pure `levelMediaModels(route)` maps level → `{ image, video }`. Media resolution becomes **Advanced override → level mapping → env → built-in default**. The runner threads the turn's level into the media tools so the chosen level governs that generation; endpoints fall back to the workspace-default level.

**Tech Stack:** Next.js + Supabase (app); TS + Claude Agent SDK + Vitest (runner). Builds on `feat/media-model-settings` (app_settings `image_model`/`video_model` = the Advanced override; `getMediaProvider`/`resolveModel`).

Design approved: Swift/Studio (2 levels), keep raw dropdowns as Advanced.

**Level → stack mapping:**
| Level (route) | LLM lane | Image model | Video model |
|---|---|---|---|
| Swift (`fast`) | fast | `imagen-4.0-generate-001` | `veo-2.0-generate-001` |
| Studio (`standard`) | deep | `imagen-4.0-ultra-generate-001` | `veo-3.0-generate-001` |

**Resolution precedence (per media type):** explicit Advanced override (`app_settings.image_model`/`video_model`, non-empty) → `levelMediaModels(level)` (level = the turn's route, else workspace default `arc_default_route`) → env (`GEMINI_IMAGE_MODEL`/`VIDEO_MODEL`) → built-in default.

---

## Task 1: Relabel the level picker (Swift / Studio)

**Files:** `src/app/arc/_components/model-select.tsx` (MODEL_OPTIONS), `src/app/settings/settings-forms.tsx` (the agent-behavior route `<select>` + label), any visible "Fast/Standard" copy in the composer/agent-settings.

- [ ] **Step 1:** In `model-select.tsx`, rename `MODEL_OPTIONS` display fields (keep `id: "fast"|"standard"`):
  - `standard` → name "Arc Studio", short "Studio", tagline e.g. "Deeper reasoning + top-tier image/video (Imagen Ultra · Veo 3)".
  - `fast` → name "Arc Swift", short "Swift", tagline "Quick replies + fast image/video (Imagen 4 · Veo 2)".
  Keep the speed/depth meters sensible (Studio deeper).
- [ ] **Step 2:** In `settings-forms.tsx` agent-behavior form, relabel the "Default model route" select → "Default Arc level"; options text → `fast` "Swift — quick, economical (Imagen 4 · Veo 2)", `standard` "Studio — best quality (Imagen Ultra · Veo 3)". Keep `name="markDefaultRoute"` + values `fast`/`standard`.
- [ ] **Step 3:** Grep `src/app/arc` + `src/app/settings` for user-visible "Fast"/"Standard"/"model route" strings tied to the route and update copy to Swift/Studio/"level". Do NOT change the `ArcRoute` type or values.
- [ ] **Step 4:** `pnpm exec tsc --noEmit` + `pnpm exec eslint` (changed files) → clean; `pnpm test` → still green (route enum unchanged). Commit: `feat(arc): rename Fast/Standard route to Swift/Studio levels (labels only)`.

---

## Task 2: Pure level → media model mapping

**Files:** Create `src/domain/arc-levels.ts` (+ test); export from `src/domain/index.ts`.

- [ ] **Step 1: Failing test** `src/domain/__tests__/arc-levels.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { levelMediaModels } from "../arc-levels";

describe("levelMediaModels", () => {
  it("Studio (standard) → Imagen Ultra + Veo 3", () => {
    expect(levelMediaModels("standard")).toEqual({ image: "imagen-4.0-ultra-generate-001", video: "veo-3.0-generate-001" });
  });
  it("Swift (fast) → Imagen 4 + Veo 2", () => {
    expect(levelMediaModels("fast")).toEqual({ image: "imagen-4.0-generate-001", video: "veo-2.0-generate-001" });
  });
});
```
- [ ] **Step 2: Implement** `src/domain/arc-levels.ts`:
```ts
import type { ArcRoute } from "./arc-chat";

/** An Arc "level" (Swift/Studio) bundles the LLM lane + the media model tier.
 *  This maps the level (route) to the image/video model it should generate with. */
export function levelMediaModels(route: ArcRoute): { image: string; video: string } {
  return route === "standard"
    ? { image: "imagen-4.0-ultra-generate-001", video: "veo-3.0-generate-001" }
    : { image: "imagen-4.0-generate-001", video: "veo-2.0-generate-001" };
}
```
(Confirm `ArcRoute` is exported from `./arc-chat`; if it lives elsewhere in domain, import from there.)
- [ ] **Step 3:** Run → PASS. Add `export * from "./arc-levels";` to `src/domain/index.ts`. tsc clean. Commit: `feat(domain): levelMediaModels — Swift/Studio → image/video model tier`.

---

## Task 3: Resolution (override → level → env → default) + thread the turn's level

**Files:** `src/lib/media/gemini.ts` + `src/lib/media/index.ts` (resolution); `src/app/api/v1/arc/media/generate-image/route.ts` + `generate-video/route.ts` (read level + workspace default); `apps/arc-runner/src/tools/index.ts` + `media.ts` (thread level); `apps/arc-runner/src/arc.ts` (pass payload.route as level). Tests updated.

- [ ] **Step 1: index.ts** — `getMediaProvider` takes a level + overrides and resolves per the precedence:
```ts
import { levelMediaModels } from "@/domain";
import type { ArcRoute } from "@/domain";
// ...
export type MediaModelPrefs = { level?: ArcRoute; imageModel?: string; videoModel?: string };

export function getMediaProvider(prefs?: MediaModelPrefs): MediaProvider | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (process.env.ARC_MEDIA_ENABLED !== "1" || !key) return null;
  const levelModels = prefs?.level ? levelMediaModels(prefs.level) : undefined;
  return createGeminiMediaProvider(key, {
    // override (explicit) → level → (env/default handled in provider via resolveModel)
    imageModel: prefs?.imageModel?.trim() || levelModels?.image || undefined,
    videoModel: prefs?.videoModel?.trim() || levelModels?.video || undefined,
  });
}
```
(`resolveModel` in the provider still applies env→default when the passed model is empty/undefined.)

- [ ] **Step 2: routes** — both generate routes resolve the level: `const level = parseArcRoute(body.level ?? settings.markDefaultRoute)` (import `parseArcRoute`, `getAppSettings`), then `getMediaProvider({ level, imageModel: settings.imageModel, videoModel: settings.videoModel })`. (generate-image reads `body.level`; generate-video reads `body.level` on the START call and can ignore it on poll.) Confirm `markDefaultRoute` is on `AppSettings` (it is — `arc_default_route`).

- [ ] **Step 3: runner** — thread the turn's route as the level. In `apps/arc-runner/src/tools/index.ts`, extend `ToolContext` with `level?: "fast" | "standard"` and pass it to `mediaTools(client, step, sink.card, ctx)`. In `arc.ts` where `toolsForMode(...)` is called for a chat turn, pass `{ ...existing ctx, level: payload.route }`. In `media.ts`, both `generate_image` and `generate_video` include `level: ctx.level` in their POST body to the generate endpoints.

- [ ] **Step 4: tests** — update `src/lib/media/__tests__/resolve.test.ts`/add a getMediaProvider-level test if feasible (or a `levelMediaModels` precedence note); update route tests' `getAppSettings` mock to include `markDefaultRoute: "fast"`; update runner `media.test.ts` to tolerate the extra `level` field in the POST body (objectContaining already does). Ensure `toolsForMode` signature change keeps `index.test.ts` green (ctx optional/defaulted).

- [ ] **Step 5:** `pnpm exec tsc --noEmit` + runner typecheck → clean; `pnpm test` + runner test → green. Commit: `feat(media): Arc level drives image/video model (override → level → env → default), threaded per turn`.

---

## Task 4: Advanced-override UI reframe + manual

**Files:** `src/app/settings/media-models-settings.tsx` + `settings-forms.tsx` (MediaModelsForm) + `settings-sections.ts` (label/description).

- [ ] **Step 1:** Reframe the existing "Media models" settings section as the **Advanced override**: section description → "Advanced — pin a specific image/video model. Overrides your Arc level (Swift/Studio). Leave on Auto to follow the level." The form's "Auto (recommended)" option now means "Follow Arc level" — update the option label to `Auto — follow Arc level` and the helper text accordingly (no logic change; "" still = follow).
- [ ] **Step 2:** `pnpm exec tsc --noEmit` + eslint → clean. Commit: `feat(settings): reframe media models as Advanced override of the Arc level`.
- [ ] **Step 3: Manual:** In `/arc`, the level pill reads **Swift/Studio**; pick Studio (per message and/or as the default) → generate an image → it uses `imagen-4.0-ultra-generate-001` (check `media.model`); Swift → `imagen-4.0-generate-001`. Set an Advanced override → it wins regardless of level. Auto override + Studio → Ultra.

---

## Self-review notes
- **Spec coverage:** relabel (T1), pure mapping (T2), resolution + per-turn threading (T3), Advanced reframe + manual (T4). Level bundles LLM+image+video; raw dropdowns kept as Advanced.
- **Type/name consistency:** `ArcRoute` unchanged (`fast`/`standard`); `levelMediaModels(route)` → `getMediaProvider({level, imageModel, videoModel})` → `resolveModel`. `markDefaultRoute` = workspace-default level fallback.
- **Reuse:** the existing route picker/composer/settings (relabel only); the `feat/media-model-settings` store + provider + Advanced dropdowns; `resolveModel`.
- **Safety:** labels-only route change (no enum churn); media still flag-gated, approval-gated, no outbound; precedence keeps env-only deploys working (Auto + no level info → env → default).
- **Build-time confirms:** where `ArcRoute` is exported in domain; the exact composer/settings copy strings; that `toolsForMode` ctx threading matches the opportunityId pattern.
