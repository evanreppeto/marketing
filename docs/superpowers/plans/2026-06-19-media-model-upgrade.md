# Media Model Upgrade (Image + Video) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Arc's image/video generation off the deprecated Imagen 4 + older Veo onto Nano Banana (Gemini 3 image) + Veo 3.1, across the Swift/Studio tiers, the provider defaults, the settings picker, and the tests.

**Architecture:** Pure config/string changes. The provider (`src/lib/media/gemini.ts`) already routes any non-`imagen*` model id through the working "Nano Banana" `generateContent` path, so swapping the model ids is sufficient — Imagen 4's `generateImages` branch just stops being selected (left as dead code). App-only; Vercel auto-deploys; the Cloud Run runner is untouched.

**Tech Stack:** TypeScript, Vitest, Next.js 16, Google Gemini media API (`@google/genai`).

**Test commands:** from repo root, `pnpm test <path>`.

**Verified model IDs** (ai.google.dev): Nano Banana Pro `gemini-3-pro-image`, Nano Banana 2 `gemini-3.1-flash-image`, Nano Banana `gemini-2.5-flash-image`, Veo 3.1 `veo-3.1-generate-preview`, Veo 3.1 Lite `veo-3.1-fast-generate-preview`.

**Target mapping:** Studio → image `gemini-3-pro-image`, video `veo-3.1-generate-preview`. Swift → image `gemini-3.1-flash-image`, video `veo-3.1-fast-generate-preview`. Provider defaults → image `gemini-2.5-flash-image`, video `veo-3.1-fast-generate-preview`.

**Not changing:** the aspect-ratio allowlists (`1:1,3:4,4:3,9:16,16:9` image; `16:9,9:16` video) — a safe subset the new models accept. The Imagen `generateImages` branch (dead code, harmless). `resolve.test.ts` (its imagen ids are arbitrary precedence fixtures, not real-model assertions).

---

## File Structure
- `src/domain/arc-levels.ts` — `levelMediaModels()` tier→model map. (modify; + test)
- `src/lib/media/gemini.ts` — `DEFAULT_IMAGE_MODEL` / `DEFAULT_VIDEO_MODEL`. (modify)
- `src/lib/media/__tests__/get-media-provider.test.ts` — level→model assertions. (modify)
- `src/app/settings/settings-forms.tsx` — image/video model `<option>`s + helper text + Swift/Studio level labels. (modify)

---

## Task 1: Update the tier→model mapping (domain)

**Files:**
- Modify: `src/domain/arc-levels.ts`
- Test: `src/domain/__tests__/arc-levels.test.ts`

- [ ] **Step 1: Update the test first**

In `src/domain/__tests__/arc-levels.test.ts`, replace the two `levelMediaModels` assertions:

```typescript
    expect(levelMediaModels("standard")).toEqual({ image: "gemini-3-pro-image", video: "veo-3.1-generate-preview" });
```
and
```typescript
    expect(levelMediaModels("fast")).toEqual({ image: "gemini-3.1-flash-image", video: "veo-3.1-fast-generate-preview" });
```
(Replace the existing lines that assert `imagen-4.0-ultra-generate-001`/`veo-3.0-generate-001` for `"standard"` and `imagen-4.0-generate-001`/`veo-2.0-generate-001` for `"fast"`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/domain/__tests__/arc-levels.test.ts`
Expected: FAIL — `levelMediaModels` still returns the old imagen/veo ids.

- [ ] **Step 3: Update `levelMediaModels`**

In `src/domain/arc-levels.ts`, replace the function body:

```typescript
export function levelMediaModels(route: ArcRoute): { image: string; video: string } {
  return route === "standard"
    ? { image: "gemini-3-pro-image", video: "veo-3.1-generate-preview" }
    : { image: "gemini-3.1-flash-image", video: "veo-3.1-fast-generate-preview" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/domain/__tests__/arc-levels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/arc-levels.ts src/domain/__tests__/arc-levels.test.ts
git commit -m "feat(media): map Arc levels to Nano Banana + Veo 3.1 models"
```

---

## Task 2: Update provider defaults + provider test

**Files:**
- Modify: `src/lib/media/gemini.ts`
- Test: `src/lib/media/__tests__/get-media-provider.test.ts`

- [ ] **Step 1: Update the provider test first**

In `src/lib/media/__tests__/get-media-provider.test.ts`, update the "level maps to its media tier" test (currently lines ~48–55) to the new ids:

```typescript
  it("level maps to its media tier when there is no override", () => {
    getMediaProvider({ level: "standard" });
    expect(lastOpts().imageModel).toBe("gemini-3-pro-image");
    expect(lastOpts().videoModel).toBe("veo-3.1-generate-preview");
    getMediaProvider({ level: "fast" });
    expect(lastOpts().imageModel).toBe("gemini-3.1-flash-image");
    expect(lastOpts().videoModel).toBe("veo-3.1-fast-generate-preview");
  });
```

The "explicit Advanced override beats the level" test (lines ~43–46) uses an arbitrary override id; update it to a current model id for clarity:

```typescript
  it("explicit Advanced override beats the level", () => {
    getMediaProvider({ level: "standard", imageModel: "gemini-2.5-flash-image" });
    expect(lastOpts().imageModel).toBe("gemini-2.5-flash-image"); // override, not Studio's Pro
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/media/__tests__/get-media-provider.test.ts`
Expected: FAIL — the level mapping still resolves to the old imagen/veo ids.

- [ ] **Step 3: Update the provider defaults**

In `src/lib/media/gemini.ts`, change the two default constants:

- `const DEFAULT_IMAGE_MODEL = "imagen-4.0-generate-001";` → `const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";`
- `const DEFAULT_VIDEO_MODEL = "veo-2.0-generate-001";` → `const DEFAULT_VIDEO_MODEL = "veo-3.1-fast-generate-preview";`

Leave everything else (the `model.startsWith("imagen")` branch, the aspect-ratio sets, `resolveModel`) unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/media/__tests__/get-media-provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/gemini.ts src/lib/media/__tests__/get-media-provider.test.ts
git commit -m "feat(media): default image=Nano Banana, video=Veo 3.1 Lite"
```

---

## Task 3: Update the settings model picker + labels

**Files:**
- Modify: `src/app/settings/settings-forms.tsx`

No unit test (UI option strings) — verified by typecheck/build in Task 4.

- [ ] **Step 1: Replace the image-model options + helper (lines ~48–55)**

Replace:
```tsx
            <option value="">Auto — follow Arc level</option>
            <option value="imagen-4.0-generate-001">Imagen 4 — photoreal, fast</option>
            <option value="imagen-4.0-ultra-generate-001">Imagen 4 Ultra — max quality</option>
            <option value="gemini-2.5-flash-image">Gemini Nano Banana — editing / reference</option>
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            Auto follows your Arc level (Swift → Imagen 4, Studio → Imagen 4 Ultra). Pick one to pin it regardless of level.
          </span>
```
with:
```tsx
            <option value="">Auto — follow Arc level</option>
            <option value="gemini-3-pro-image">Nano Banana Pro — 4K, text, max quality</option>
            <option value="gemini-3.1-flash-image">Nano Banana 2 — fast, high-volume</option>
            <option value="gemini-2.5-flash-image">Nano Banana — editing / reference</option>
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            Auto follows your Arc level (Swift → Nano Banana 2, Studio → Nano Banana Pro). Pick one to pin it regardless of level.
          </span>
```

- [ ] **Step 2: Replace the video-model options + helper (lines ~61–66)**

Replace:
```tsx
            <option value="">Auto — follow Arc level</option>
            <option value="veo-2.0-generate-001">Veo 2</option>
            <option value="veo-3.0-generate-001">Veo 3 — higher quality</option>
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            Auto follows your Arc level (Swift → Veo 2, Studio → Veo 3). Video generation needs billing on the Gemini key.
          </span>
```
with:
```tsx
            <option value="">Auto — follow Arc level</option>
            <option value="veo-3.1-generate-preview">Veo 3.1 — cinematic, synced audio</option>
            <option value="veo-3.1-fast-generate-preview">Veo 3.1 Lite — fast & economical</option>
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            Auto follows your Arc level (Swift → Veo 3.1 Lite, Studio → Veo 3.1). Video generation needs billing on the Gemini key.
          </span>
```

- [ ] **Step 3: Update the Swift/Studio level labels (two occurrences)**

The strings `Swift — quick & economical (Imagen 4 · Veo 2)` and `Studio — best quality (Imagen Ultra · Veo 3)` each appear twice (the agent-behavior level selector is rendered in two forms). Replace ALL occurrences:

- `Swift — quick & economical (Imagen 4 · Veo 2)` → `Swift — quick & economical (Nano Banana 2 · Veo 3.1 Lite)`
- `Studio — best quality (Imagen Ultra · Veo 3)` → `Studio — best quality (Nano Banana Pro · Veo 3.1)`

(Use a replace-all edit for each string so both copies update.)

- [ ] **Step 4: Verify no stale references remain**

Run: `rg -n "Imagen|imagen-4|veo-2|veo-3\.0|Veo 2|Veo 3 " src/app/settings/settings-forms.tsx`
Expected: no matches (all picker options + labels now reference Nano Banana / Veo 3.1). A match means a spot was missed.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/settings-forms.tsx
git commit -m "feat(media): settings picker + level labels show Nano Banana + Veo 3.1"
```

---

## Task 4: Sweep + build

- [ ] **Step 1: Run the media + domain tests**

Run: `pnpm test src/domain/__tests__/arc-levels.test.ts src/lib/media`
Expected: all pass (arc-levels, get-media-provider, resolve, and the rest of `src/lib/media`).

- [ ] **Step 2: Confirm no stale model ids linger in code**

Run: `rg -n "imagen-4|veo-2\.0|veo-3\.0-generate" src/ | rg -v "__tests__/resolve.test.ts"`
Expected: no matches outside the `gemini.ts` Imagen *branch comments* (the `model.startsWith("imagen")` branch may still mention Imagen — that's the intentional dead-code path). If a non-comment default/mapping still uses an old id, fix it.

- [ ] **Step 3: Production build (the real typecheck gate)**

Run: `pnpm build`
Expected: build succeeds. (`pnpm lint` is eslint-only; the Next build/tsc is what catches type errors.) If `node_modules` is missing deps, run `pnpm install` first. Fix only feature-caused failures.

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git add -A
git commit -m "test(media): model upgrade verification fixups"
```

- [ ] **Step 5: Manual smoke (post-deploy, operator)**

After this merges and Vercel deploys, in `/arc`: generate an image on Swift and on Studio, and a short video — confirm a real asset lands as an approval-gated draft with AI provenance. (The Gemini calls are mocked in unit tests, so the live smoke is the true check.) If a model-not-found error appears, the `-preview` id may have GA-renamed — update `arc-levels.ts` or set `GEMINI_IMAGE_MODEL`/`GEMINI_VIDEO_MODEL`.

---

## Self-Review (plan author)

- **Spec coverage:** tier mapping → Task 1; provider defaults → Task 2; settings picker + labels → Task 3; tests + build + smoke → Task 4. Aspect-ratio allowlist intentionally unchanged (spec said verify/widen-if-needed; it's a safe subset — documented as not-changing). Imagen dead-code left intact (spec non-goal). All covered.
- **Placeholder scan:** none — every edit shows exact old/new strings.
- **Type consistency:** model ids are plain strings; `levelMediaModels` return shape `{ image, video }` unchanged; `resolveModel`/`getMediaProvider` signatures untouched. The new ids match the verified IDs table and are identical across `arc-levels.ts`, `gemini.ts`, the tests, and the settings options.
- **Risk note:** `-preview` ids may GA-rename (Task 4 Step 5 + env-override escape hatch). Stored settings overrides pointing at a removed `imagen-*` option still pass through `resolveModel` (the value works even if the dropdown no longer lists it) — acceptable, no migration needed.
```
