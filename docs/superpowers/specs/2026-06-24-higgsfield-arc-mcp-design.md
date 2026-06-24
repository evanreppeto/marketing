# Higgsfield in the Arc runner — design

**Date:** 2026-06-24
**Status:** Approved design, pending spec review
**Author:** Arc / Evan

## Context

Big Shoulders / Summit Restoration now has a **Higgsfield Ultra** subscription ($99/mo
creator plan): unlimited-ish, 8-parallel image/video generation in the higgsfield.ai
**web app**, with ~30 models (Sora 2, Veo 3, Kling 3.0, Soul character training, Flux,
Nano Banana). CLAUDE.md previously gated Higgsfield "operationally off until the
subscription is active." It is now active.

Goal: let the **deployed Arc agent** (`apps/arc-runner`, headless on Cloud Run) produce
Higgsfield media — marketing videos, cinematic image-to-video, UGC/viral variants,
virality prediction — as **approval-gated, provenance-tagged draft assets**. No outbound
send. Single-tenant (one BSR workspace) for now; multi-company per-workspace credentials
are explicitly deferred.

### What already exists (the seam was built for this)

- **Arc runs on MCP.** `apps/arc-runner/src/arc.ts` builds an in-process SDK MCP server
  (`createSdkMcpServer({ name: "arc" })`) and passes it to the Agent SDK
  `query({ options: { mcpServers: { arc } } })`. Adding Higgsfield = a second, *remote*
  `mcpServers` entry + tool-gating.
- **Connector schema anticipates remote MCP.** `src/domain/connectors.ts`
  `ConnectorRegistryEntry` already declares `mcpUrl`, `authHeader`, and `toolNamespace`
  with comments naming "Slice B" (connectors loaded into the runner). Today only the
  native `gemini-research` connector ships; no runner-side loader exists yet.
- **Per-workspace credential storage exists.** `src/lib/connectors/credentials.ts` stores
  secrets in Supabase Vault; `src/lib/connectors/read-model.ts`
  (`resolveConnectorCredentialRef`) resolves the ref for an *enabled* connector.
- **Provenance is partly wired.** `src/lib/campaigns/gallery.ts` already classifies a
  `higgsfield` tool source as AI-generated media.

### The hard constraint

Higgsfield's hosted MCP (`https://mcp.higgsfield.ai/mcp`) authenticates **only via
interactive browser OAuth redirect** ("no API keys... credentials are managed through a
browser redirect"). Plan credits transfer automatically. But the Cloud Run runner is
**headless** — it cannot perform an interactive redirect per session. The connector
schema's `authHeader` field assumes a **static, replayable header credential**. Whether
the Ultra MCP can be driven that way headlessly is **unverified** — and is the single
assumption the whole "Ultra credits, no key, headless Arc" premise rests on.

The separate **Higgsfield Cloud API** (`cloud.higgsfield.ai`, Bearer key,
`POST /v1/generations`, async poll/webhook) is the robust headless path but bills its own
credits and is the key we are deliberately deferring.

## Phase 0 — Headless-OAuth spike (go/no-go)

**Question:** can a headless process call a Higgsfield MCP tool on the Ultra credits,
using a credential we can store and replay?

1. **Token-source recon (cheapest first).** Check whether the Higgsfield account / cloud
   console exposes any reusable or personal token. If yes, the OAuth problem dissolves
   into the existing `authHeader` model and we skip straight to a header token.
2. **One interactive OAuth.** Evan connects Higgsfield to a Claude Code-class client
   (Settings → Connectors → `https://mcp.higgsfield.ai/mcp` → authorize with his Higgsfield
   account). *Requires Evan's hands — his account login.*
3. **Capture the minted token(s).** Locate where the Agent SDK's MCP client persists the
   access + refresh tokens after the redirect completes.
4. **Replay headlessly.** Throwaway script `apps/arc-runner/src/spike-higgsfield.ts`
   (mirrors `spike-multimodal.ts`) runs `query()` with
   `mcpServers: { higgsfield: { type: "http", url, headers: { Authorization: "Bearer <token>" } } }`
   and `allowedTools` for one cheap Higgsfield tool (virality prediction or a tiny image
   gen), from a process with no browser.

**Pass criteria:** the tool returns a real result AND an Ultra credit is consumed, with no
browser involved. Record token TTL / refresh behavior.

**On fail:** STOP. Report findings and re-decide between (a) Cloud API key (robust,
separate billing) or (b) Higgsfield on interactive Claude only. Do not write Phase 1.

## Phase 1 — Connector-seam build (only if the spike passes)

1. **Domain.** Add a `higgsfield` entry to `CONNECTOR_REGISTRY`:
   `mcpUrl: "https://mcp.higgsfield.ai/mcp"`, `authHeader: "Authorization"`,
   `toolNamespace: "higgsfield"`, `authKind` per spike finding (`oauth` or `api_key`),
   `access: "gated_write"`. Update `connectors.test.ts`.
2. **App route.** Bearer-gated `POST /api/v1/arc/connectors` (or `GET`) returning this
   workspace's *enabled* remote-MCP connectors with decrypted credentials:
   `[{ toolNamespace, mcpUrl, authHeader, token }]`. Reuses `resolveConnectorCredentialRef`
   + `readConnectorCredential`. Same trust boundary as the runner's existing
   `ARC_AGENT_API_TOKEN` (server-to-server, secret never reaches a browser).
3. **Runner Slice-B loader.** New `apps/arc-runner/src/connectors.ts`: fetch enabled
   connectors at turn start, build remote `mcpServers` entries, merge with the in-process
   `arc` server in `runArcQuery`, and extend `allowedTools` with the namespaced tool names.
   Gated to **draft / act / campaign-task** modes (not ask / scan). Graceful no-op when the
   connector is absent/disabled (Arc behaves exactly as today).
4. **Provenance + landing.** System-prompt guidance: when Arc generates Higgsfield media,
   it saves the result into the Library as a **draft, provenance-tagged** asset (existing
   library/media tools) before surfacing it. Never auto-attach to outbound.
5. **Safety.** All six Higgsfield tools *produce or analyze* media; none *send*. They fit
   the "Arc drafts assets, human approves" rule and belong in draft/act modes. Outbound
   remains tool-less in every mode.
6. **Tests.** Registry entry; the app route (mock Vault); the connector loader's pure
   parts (mapping connector views → `mcpServers` + `allowedTools`). Live MCP calls are
   covered by the spike, not unit tests. Verify whether `apps/arc-runner/src/tools/index.test.ts`
   (which pins per-mode tool sets for the SDK `arc` server) needs any accounting for
   remote tools — they live outside the `arc` server, so likely not, but confirm.

## Out of scope (YAGNI / deferred to multi-company)

- Per-workspace connector OAuth UI and onboarding.
- Automated token refresh / rotation service.
- Higgsfield Cloud API key path (revisit only if the spike fails or at multi-tenant scale).
- Higgsfield-specific UI surfaces (asset cards already render AI provenance).

## Open questions

- Token TTL and refresh: if the captured token is short-lived, single-tenant prototype may
  need a periodic manual re-auth until the multi-company OAuth service is built. The spike
  measures this.
- Exact Higgsfield MCP tool names + input schemas (discovered live during the spike; they
  drive `allowedTools` and the provenance prompt).
