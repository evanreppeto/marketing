# Campaign Deploy & Share — Design

**Date:** 2026-06-16
**Status:** Approved (pending spec review)
**Area:** `src/app/campaigns/[campaignId]` — individual campaign workspace

## Problem

The individual campaign page (`CampaignSimpleDetail`) lets an operator review and
approve pieces, then dead-ends. After a piece is approved the UI shows the line
*"This piece has already moved past review."* — with no way to act on it. The
campaign-level `#send-export` anchor referenced by the action-hub model is never
rendered on this page.

Meanwhile the backend already supports everything needed to ship work:

- `deployAsset()` / `deployAssetAction` — unlock one approved piece, queue it in the
  Outbox, record an `asset_deployed` handoff event for Mark/Hermes.
- `launchCampaign()` / `launchCampaignAction` — verify all gating pieces are decided,
  unlock every approved piece, mark the campaign live, queue dispatches, record a
  `campaign_launched` handoff event.
- `getCampaignDispatches(campaignId)` + the `/outbox` console + `execute-resend.ts`
  (email is wired end-to-end through Resend).
- `getConnections()` — per-provider connection status (Resend email; Instagram /
  Facebook / LinkedIn / X social; no SMS provider exists).

These capabilities are wired into *older* components (`creative-tab`,
`campaign-right-rail`, `campaign-package-panel`, `campaign-content-table`) that the
current simple-detail page no longer uses. So the power exists but is invisible on
the page operators actually look at.

## Goals

- Make it easy to deploy **one approved piece** or the **entire campaign** from the
  individual campaign page.
- Be honest about what "deploy" means: the app never sends silently. Deploy is an
  operator-initiated **hand-off** — it unlocks the piece, queues it in the Outbox,
  and records a handoff event Mark/Hermes executes. The operator's click *is* the
  human approval the product's non-negotiable requires.
- Per-channel **hybrid** behavior: if a channel has a live connection, offer the
  hand-off; if it doesn't, fall back to copy/download so a piece is never a dead end.
- Raise visibility, professionalism, and clarity: show connection status inline,
  surface Outbox/dispatch state, link to Settings when a channel isn't wired.

## Non-Goals (saved for later)

- PDF / one-pager export for partner handoff.
- Public shareable preview links.
- Wiring a real SMS provider (Twilio). SMS pieces use copy-to-clipboard in v1.
- Changing the approval/decision flow itself (Approve / Request rework / Remove stays
  exactly as is).

## Core Decision

A new **"Deploy & Share" launchpad** section on the campaign page. For each piece the
primary action adapts to its channel's connection status (the hybrid model the user
chose):

| Channel | Connection | Primary action | Always available |
|---|---|---|---|
| Email | Resend connected | **Deploy** (hand off → Outbox → Resend send) | Copy text |
| Email | Resend not connected | Copy text | — |
| Social | matching platform connected | **Deploy** (hand off → Outbox) | Copy caption, Download media |
| Social | not connected | Copy caption | Download media |
| SMS | (no provider) | Copy text | — |
| Website / Export / CRM | n/a | Copy text | Download media (if any) |

"Deploy" maps to the existing `deployAssetAction`; "Deploy entire campaign" maps to
`launchCampaignAction`. "Copy"/"Download" are new client-only affordances that touch
nothing external.

## Visual Direction

**Launch console (frame) + content previews (per piece).** A confident, instrument-
like section in the real palette (warm near-black surfaces, antique-gold primary,
per `DESIGN.md`), not a spreadsheet:

- A readiness header: *"3 of 4 pieces ready to ship"* + one gold **Deploy campaign**
  primary button. Subtext: *"Deploy hands approved pieces to Mark via the Outbox.
  Nothing sends until you click."*
- One row per piece showing a small real-content preview (subject + body snippet for
  email/SMS; thumbnail for media), a status dot, the channel + connection status, and
  the routing-aware action buttons.
- A footer Outbox strip: *"1 piece queued · handed to Mark"* linking to `/outbox`
  (reuses the existing `DispatchPanel` styling/data).

Follows `DESIGN.md`: canonical `Button`/`buttonClasses`, `StatusPill`, no side-stripe
accent borders, no nested cards, no hover levitation, SVG line icons only.

## Component Architecture

Keep pure logic in a testable model module; keep I/O in the page; keep interactivity
in small client islands. Mirrors the existing `campaign-detail-model.ts` +
`campaign-package-workspace.tsx` split.

1. **`campaign-deploy-model.ts`** (new, pure, unit-tested) — alongside
   `campaign-detail-model.ts`.
   - `buildDeployLaunchpad(detail: LiveCampaignWorkspace, connections: ConnectionView[]): DeployLaunchpad`
   - Returns:
     ```ts
     type DeployPieceMode = "deploy" | "share" | "locked" | "deployed";
     type DeployPiece = {
       id: string;
       title: string;
       channel: string;           // contentWhere(asset): Email | SMS | Social | ...
       statusLabel: PlainStatus["label"];
       mode: DeployPieceMode;
       connectionLabel: string;   // "Resend connected" | "Instagram not connected" | "No SMS connection"
       connectionReady: boolean;
       previewText: string;       // subject/body snippet
       mediaUrls: string[];       // for Download
       copyText: string;          // assembled subject + body / caption for clipboard
       lockReason: string | null; // e.g. "Approve first"
     };
     type DeployLaunchpad = {
       readyCount: number;
       totalShippable: number;    // pieces past review
       canDeployCampaign: boolean;
       deployCampaignBlockedReason: string | null; // e.g. "Approve every piece first — 1 still pending"
       pieces: DeployPiece[];
     };
     ```
   - Channel→connection mapping is pure: Email→`resend`; Social→any connected social
     provider (`instagram|facebook|linkedin|x`); SMS/Website/Export/CRM→no send
     connection (share-only). Uses existing `contentWhere` + `contentStatusForLaunch`.
   - `mode`: `deployed` if already Live/dispatch-unlocked; `locked` if not yet
     approved (Review/Draft/Blocked); `deploy` if approved **and** channel connected;
     `share` if approved but channel not connected.

2. **`campaign-deploy-launchpad.tsx`** (new) — renders the section from
   `DeployLaunchpad`. Server-rendered shell; the deploy/launch buttons are existing
   client action forms (`useActionState`), the copy buttons are a small client island.
   - Campaign-level **Deploy campaign** button: a client confirm step ("This hands N
     pieces to Mark to send via connected channels. Continue?") wrapping
     `launchCampaignAction`. Disabled with `deployCampaignBlockedReason` when pending.
   - Per-piece: `mode === "deploy"` → `deployAssetAction` form (label "Deploy") + Copy;
     `mode === "share"` → Copy / Download only; `mode === "deployed"` → "Queued in
     Outbox" pill + link + reopen path (existing `reopenAssetAction`); `mode ===
     "locked"` → disabled with `lockReason`.

3. **`copy-text-button.tsx`** (new, client) — `navigator.clipboard.writeText`, shows a
   transient "Copied" state. Reduced-motion safe, follows button tokens.

4. **`campaign-simple-detail.tsx`** (edit) — render `<CampaignDeployLaunchpad>` between
   the progress bar and the package workspace. Replace the dead-end
   *"This piece has already moved past review."* text in
   `campaign-package-workspace.tsx` with an inline Deploy/Share shortcut (the same
   action set, compact) so reviewing and shipping connect.

5. **`[campaignId]/page.tsx`** (edit) — fetch `getConnections()` and
   `getCampaignDispatches(campaignId)` alongside the existing detail fetch and pass
   them down. Both already degrade gracefully without Supabase.

6. **Outbox strip** — reuse the existing `DispatchPanel` component (it already renders
   `DispatchView[]` with status pills + an Outbox link); mount it inside the launchpad
   footer. No new dispatch read code needed.

## Data Flow

```
page.tsx (server)
  getCampaignWorkspaceDetail(campaignId)  ─┐
  getConnections()                         ├─► buildDeployLaunchpad(detail, connections)
  getCampaignDispatches(campaignId)       ─┘            │
                                                        ▼
                                        <CampaignDeployLaunchpad launchpad dispatches />
       per-piece Deploy  ──► deployAssetAction  ──► deployAsset()  ──► Outbox + handoff event
       Deploy campaign   ──► launchCampaignAction ─► launchCampaign() ─► Outbox + handoff event
       Copy / Download   ──► client only (clipboard / anchor download), no server call
```

Existing actions already `revalidatePath`; after deploy the piece re-renders in
`deployed` mode and appears in the Outbox strip.

## Error Handling

- Reuse action result states (`LaunchActionState`): show inline success/failure text
  exactly as `DecisionControls` does (green/red).
- Without Supabase, the deploy/launch actions already return a friendly
  "Supabase isn't configured" message — surface it inline; the launchpad still renders
  with copy/download share affordances working (they need no backend).
- `launchCampaign` already guards "approve every piece first" / "nothing approved" —
  mirror those as the disabled-button reason via `deployCampaignBlockedReason` so the
  operator sees the block *before* clicking, and the server stays the source of truth.
- Copy/clipboard failures (e.g. permissions): the copy button falls back to selecting
  the text and showing "Press Ctrl/Cmd+C".

## Connection Awareness

When the launchpad contains any `share`-mode piece whose channel *could* be connected
(Email, Social), show one quiet note linking to Settings → Connections:
*"Instagram isn't connected — copy the caption to post manually, or connect it in
Settings."* No note for inherently share-only channels (SMS/Website/Export/CRM).

## Testing

- **`campaign-deploy-model.test.ts`** (new, primary coverage): `buildDeployLaunchpad`
  across the matrix — approved+connected → `deploy`; approved+unconnected → `share`;
  pending → `locked` with reason; already-live → `deployed`; campaign-deploy guard
  (pending present → blocked with reason; all approved → enabled); channel→connection
  mapping for email/social/sms; `copyText` assembly (subject + body).
- Follows the existing `campaign-detail-model.test.ts` style (pure, no I/O).
- `pnpm lint` scoped to changed files; `pnpm build` for types (typed Supabase enums).
- Manual: approve a piece → Deploy → confirm it lands in `/outbox`; unconnected
  channel → Copy/Download work; Deploy campaign disabled until all pieces decided.

## Files

**New**
- `src/app/campaigns/_components/campaign-deploy-model.ts`
- `src/app/campaigns/_components/__tests__/campaign-deploy-model.test.ts`
- `src/app/campaigns/_components/campaign-deploy-launchpad.tsx`
- `src/app/campaigns/_components/copy-text-button.tsx`

**Edited**
- `src/app/campaigns/[campaignId]/page.tsx` — fetch connections + dispatches, pass down
- `src/app/campaigns/_components/campaign-simple-detail.tsx` — mount the launchpad
- `src/app/campaigns/_components/campaign-package-workspace.tsx` — inline Deploy/Share
  shortcut replacing the dead-end text

**Reused unchanged**
- `deployAssetAction`, `launchCampaignAction`, `reopenAssetAction` (`campaigns/actions.ts`)
- `getConnections` (`lib/connections/read-model.ts`), `getCampaignDispatches`
  (`lib/dispatch/read-model.ts`), `DispatchPanel` (`_components/dispatch-panel.tsx`)
- `Button`/`buttonClasses`, `StatusPill` (`_components/page-header.tsx`)

## Non-Negotiable Compliance

Agent does the work; human approves; database remembers. Deploy is operator-initiated
and gated; the app records state and hands off to Mark/Hermes — it never sends
autonomously. No new automatic outbound behavior is introduced. Higgsfield is untouched.
