# Model Selection — Design (three layers, not one picker)

Status: proposed · Owner: Arc platform · Last updated: 2026-07-08

## Problem

"Let users pick which models they use" sounds like one setting. It's actually
**three independent choices at three altitudes.** Mixing them into a single flat
picker is a UX and conceptual error — it implies `claude-opus-4-8` and `veo3` are
substitutable, which they aren't (one is Arc's brain, the other is a tool the
brain calls). This doc defines the three layers, the selectable options in each,
and the one that still needs wiring.

Guiding principle everywhere: **Auto is the default; selection is an override.**
Arc is an agent — it should pick the right model per task. The human overrides
when they have a reason.

---

## Layer 1 — Backend / connector (which engines are ON)

**What the user chooses:** Is Higgsfield connected? Gemini? With whose credits.
**Status:** ✅ real & persisted — `workspace_connectors` +
`listWorkspaceConnectors` (`src/lib/connectors/read-model.ts`). Binary on/off,
credential-gated per workspace.

| Connector key | Label | Auth | Access | Notes |
|---|---|---|---|---|
| `gemini-research` | Gemini Web Research | api_key | read_only | Grounded web search (native, `mcpUrl: null`) |
| `higgsfield` | Higgsfield | oauth | gated_write | Remote MCP — the media engine (fans out to ~59 models) |

Only change worth making: surface a "credits/cost owner" line so operators know
Higgsfield burns their own credits.

---

## Layer 2 — Media model (which model *inside* Higgsfield)

**What the user chooses:** per output category, which specific model Arc generates
with. **Status:** ✅ persistence + exposure shipped; ⏳ runner consumption pending.
The picker now persists and is exposed to the runner; what remains is the runner
*using* the config (see "Remaining" below).

Shipped:
- **Domain** — `src/domain/media-config.ts` (`MediaConfig`, `parseMediaConfig`,
  `effectiveMediaModel`) + tests. The trusted boundary that validates any stored
  model id against the live roster.
- **Schema** — `workspace_media_config` (`20260708120000_...`), one row/workspace,
  `config` jsonb; mirrors `workspace_connectors` keying.
- **Lib** — `src/lib/media-config/{read-model,persistence}.ts`.
- **Action** — `saveMediaConfigAction` (`src/app/(app)/settings/actions.ts`),
  operator-gated via workspace context + `isSupabaseAdminConfigured`.
- **UI** — Settings → Media models now persists (per-category default + auto-pick,
  aspect, prefer-real-media, allow-video) with a Save control.
- **Runner API** — `GET /api/v1/arc/media-config` (bearer-gated) returns the config.

**Selectable options** (subset of the 44-model live roster; provider in parens):

- **Image** — Auto (Arc's pick) · Marketing Studio Image *(recommended)* ·
  Nano Banana / Nano Banana 2 / Nano Banana Pro (Google) · Flux 2.0 / Flux Kontext
  Max (Black Forest Labs) · GPT Image 2 (OpenAI) · Seedream 4.5 (Bytedance) · …
- **Video** — Auto (Arc's pick) · Marketing Studio *(recommended)* ·
  Google Veo 3 / Veo 3.1 / Veo 3.1 Lite (Google) · Kling 3.0 (Kling) ·
  Seedance 2.0 (Bytedance) · Grok Imagine (xAI) · …
- **Audio** — Auto (Arc's pick) · Inworld TTS *(recommended)* · Mirelo SFX · Sonilo Music

Design: **per-category** default (image/video/audio have separate overrides —
"always Veo for video, let Arc pick images" is the real use case). "Auto" is the
default and visibly recommended.

### Runner consumption — ✅ shipped
The override reaches **Arc's decision**: `GET /api/v1/arc/media-config` returns
resolved per-category defaults (`resolveMediaDefaults`, computed app-side since the
runner can't import `@/domain`); the runner fetches it in work modes
(`apps/arc-runner/src/media-config.ts`) and injects a **MEDIA MODEL DEFAULTS** block
into Arc's system prompt (`context.ts` → `mediaConfigBlock`). An operator-locked
model reads as a firm default ("use `veo3_1` unless the task truly needs another");
an auto-pick reads as a recommendation; `allowVideo:false` tells Arc not to generate
video. Best-effort — a config miss never breaks a turn (Arc just auto-picks).

---

## Layer 3 — Reasoning model (which Claude model Arc *thinks* with)

**What the user chooses:** the quality/speed of Arc's brain.
**Status:** 🔒 hardcoded tiers in `apps/arc-runner/src/inference.ts`, not surfaced.

**Recommendation: expose a branded tier, NOT raw model ids.** Raw ids rot (the
code is already a version behind — see below), users don't know Sonnet-vs-Opus,
and the cost rails (`maxBudgetUsd`, `maxTurns`) live per-tier. Keep it optional
and collapsed by default — most workspaces should never touch it.

Tier names are Arc-native (**Pulse / Drive / Deep**) — each carries its
speed/capability descriptor in the UI and maps to a Claude model under the hood:

| Tier (what the user sees) | Descriptor | Claude model | Model ID | When |
|---|---|---|---|---|
| **Arc Pulse** | Instant | Claude Sonnet 5 | `claude-sonnet-5` | Interactive chat — quick, cheap |
| **Arc Drive** *(default)* | Balanced | Claude Opus 4.8 | `claude-opus-4-8` | Drafting, scans, campaign work |
| **Arc Deep** | Maximum | Claude Opus 4.8 *(max deliberation)* | `claude-opus-4-8` | Hardest long-horizon runs |

**For right now the ceiling is Opus 4.8.** Deep runs the same model as Drive but
at maximum deliberation — deeper thinking budget, more turns, higher spend cap.
**Claude Fable 5** (`claude-fable-5`) is the intended future occupant of Deep once
its operational requirements (30-day data retention, refusal/fallback handling)
are cleared — enabling it is a one-line model swap.

Internally these map to the existing `ArcRoute` (`fast` → Pulse, `standard` →
Drive; `deep` is a new, dormant tier). Fallback per tier (keeps a turn alive if
the primary is unavailable): Pulse → `claude-haiku-4-5`, Drive → `claude-sonnet-5`,
Deep → `claude-opus-4-7`.

### Note: the runner is a version behind
`inference.ts` currently uses:
- FAST `claude-sonnet-4-6` → **should be `claude-sonnet-5`** (near-Opus quality at
  Sonnet cost; adaptive thinking on by default).
- STANDARD `claude-opus-4-8` → current, correct.

Independent of the picker, bumping FAST to Sonnet 5 is a one-line quality win.
(Sonnet 5 uses a new tokenizer ~30% heavier than 4.6 — re-baseline the
`maxBudgetUsd` rail when bumping.)

---

## Summary

| Layer | Choice | Default | State |
|---|---|---|---|
| 1. Backend | Higgsfield/Gemini on/off + credential | off until connected | ✅ done |
| 2. Media model | per-category model within Higgsfield | Auto (Arc picks) | ✅ done (persist + expose + runner injection) |
| 3. Reasoning | Arc Pulse / Drive / Deep tier | Arc Drive (Opus 4.8); ceiling Opus 4.8 for now | 🔒 build tier picker later |

**Do next:** close the Layer 2 loop (it's the one that's visibly "wired" in the UI
but silently does nothing). Layer 3 = bump FAST to Sonnet 5 now; build the tier
picker only if a customer asks to control it.
