# Campaign Slim-Intel + Arc Drawer Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the campaign workspace's fixed 360px right rail with a full-width content area, a slim collapsible "decision context" bar, and a larger slide-over "Chat with Arc" drawer (openable campaign-wide and pre-targeted per asset), leaving a disabled hook for future Gemini/Veo/Nano Banana generation.

**Architecture:** Pure client-side React UI restructure inside `src/app/campaigns/_components/`. No backend, server-action, auth, or read-model changes. The existing `requestRevisionAction` and `IntelligencePanel` are reused as-is; `MarkRail` is replaced by two new focused components (`DecisionContextBar`, `MarkDrawer`).

**Tech Stack:** Next.js 16 (App Router), React 19 (`useActionState`, `useState`, `useEffect`, `useRef`), Tailwind with the project's CSS-var design tokens. Verification: `pnpm lint` + `pnpm build` (TypeScript) + manual operator-view checks. No React component test harness exists (only vitest for `src/domain`, which is untouched here).

**Spec:** `docs/superpowers/specs/2026-06-02-campaign-arc-drawer-intel-redesign-design.md`

---

## File Structure

- **Create** `src/app/campaigns/_components/decision-context-bar.tsx` — slim intel strip + "Details" disclosure wrapping the existing `IntelligencePanel`. Owns the intel-collapse responsibility.
- **Create** `src/app/campaigns/_components/arc-drawer.tsx` — slide-over "Chat with Arc" panel: disabled generate hook, enlarged revise form (`requestRevisionAction`), and a read-only event activity thread. Owns the Arc-interaction responsibility. Takes discrete props (no shared context object).
- **Modify** `src/app/campaigns/_components/campaign-workspace.tsx` — drop the 2-col grid, add drawer open state, mount `DecisionContextBar` + `MarkDrawer`, add the "Chat with Arc" trigger in the tab row, repoint `pickAsset` to open the drawer.
- **Modify** `src/app/campaigns/_components/creative-tab.tsx` — no code change required (its existing per-asset button calls `onPickAsset`, which now opens the drawer); included only as a verification target.
- **Delete** `src/app/campaigns/_components/arc-rail.tsx` — superseded.

Build the leaf components first (Tasks 1–2), then wire the workspace (Task 3), then remove the dead file and verify end-to-end (Tasks 4–5).

---

## Task 1: DecisionContextBar (slim intel + disclosure)

**Files:**
- Create: `src/app/campaigns/_components/decision-context-bar.tsx`

Reuses `IntelligencePanel` / `IntelligencePanelModel` from `@/app/_components/intelligence-panel`, `StatusPill` from `@/app/_components/page-header`. The intel model object is the exact one `arc-rail.tsx:36-53` builds today.

- [ ] **Step 1: Create the component file**

```tsx
"use client";

import { useState } from "react";

import { IntelligencePanel, type IntelligencePanelModel } from "@/app/_components/intelligence-panel";
import { StatusPill } from "@/app/_components/page-header";

export type DecisionContext = {
  persona: string;
  leadsCount: number;
  tools: string[];
  whyBuilt: string;
};

/** Build the full intelligence model once — shared by the collapsed bar and the expanded panel. */
export function buildIntelligenceModel(context: DecisionContext): IntelligencePanelModel {
  return {
    title: "Campaign decision context",
    persona: context.persona,
    confidence: context.leadsCount > 0 ? "Evidence linked" : "Needs source records",
    journeyStage: "Campaign review",
    urgency: "Human gate",
    attentionReason: context.whyBuilt,
    nextBestAction: "Review the creative, source evidence, and guardrails before approving any next step.",
    cta: "Trade partners: Become a Partner. Property managers: Request Vendor Packet. Homeowners: Call Now / Upload Photos.",
    messageAngle: "Fast restoration handoff, mitigation documentation, and coverage-neutral next-step clarity.",
    guardrailStatus: "Outbound locked. Arc can revise, but no send, publish, launch, or spend action is enabled here.",
    scores: [
      { label: "Leads", value: context.leadsCount, detail: "Linked audience records", tone: context.leadsCount > 0 ? "blue" : "gray" },
      { label: "Tools", value: context.tools.length, detail: context.tools.length > 0 ? context.tools.join(", ") : "No tools recorded", tone: context.tools.length > 0 ? "blue" : "gray" },
    ],
    proofPoints: context.tools.length > 0 ? context.tools.map((tool) => `${tool} used by Arc`) : [],
    outboundLocked: true,
  };
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1 text-xs">
      <span className="font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--text-primary)]">{value}</span>
    </span>
  );
}

export function DecisionContextBar({ context }: { context: DecisionContext }) {
  const [open, setOpen] = useState(false);
  const model = buildIntelligenceModel(context);
  const confidence = context.leadsCount > 0 ? "Evidence linked" : "Needs source records";

  return (
    <section className="module-rise mb-5 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="signal-eyebrow mr-1">Growth intelligence</span>
        <Pill label="Persona" value={context.persona} />
        <Pill label="Confidence" value={confidence} />
        <Pill label="Stage" value="Campaign review" />
        <Pill label="Leads" value={String(context.leadsCount)} />
        <Pill label="Tools" value={String(context.tools.length)} />
        <StatusPill tone="amber">Outbound locked</StatusPill>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)]"
        >
          {open ? "Hide details ▴" : "Details ▾"}
        </button>
      </div>
      {open ? (
        <div className="border-t border-[var(--border-hairline)] p-4">
          <IntelligencePanel model={model} />
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck the new file in isolation**

Run: `pnpm lint`
Expected: PASS with no errors referencing `decision-context-bar.tsx`. (It is not yet imported anywhere; lint still type-aware-checks it.)

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/decision-context-bar.tsx
git commit -m "feat(campaigns): slim decision-context bar with intel disclosure"
```

---

## Task 2: MarkDrawer (slide-over chat/revise surface)

**Files:**
- Create: `src/app/campaigns/_components/arc-drawer.tsx`

Reuses `requestRevisionAction` from `../actions`, `Button`/`buttonClasses` from `@/app/_components/page-header`, and the `CampaignWorkspaceEvent` type from `@/lib/campaigns/read-model` for the activity thread. This file owns what `arc-rail.tsx` did, minus the intel panel (now in Task 1) and as a drawer rather than a rail.

- [ ] **Step 1: Create the component file**

```tsx
"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/app/_components/page-header";
import type { CampaignWorkspaceEvent } from "@/lib/campaigns/read-model";

import { requestRevisionAction } from "../actions";

export function MarkDrawer({
  open,
  onClose,
  campaignId,
  assets,
  targetAssetId,
  onSelectAsset,
  events,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  assets: Array<{ id: string; title: string; channel: string }>;
  targetAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
  events: CampaignWorkspaceEvent[];
}) {
  const [state, formAction, isPending] = useActionState(requestRevisionAction, null);
  const hasAssets = assets.length > 0;
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Chat with Arc">
      <div className="absolute inset-0 bg-[oklch(0.15_0_0/0.5)]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-[34rem] flex-col bg-[var(--surface-panel)] shadow-[var(--elev-panel)] outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div>
            <div className="signal-eyebrow">Arc</div>
            <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">Chat with Arc</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Creates a revision request. Nothing is sent.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2.5 py-1 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)]"
          >
            Close ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Future Gemini/Veo/Nano Banana hook — intentionally disabled this round. */}
          <button
            type="button"
            disabled
            title="Coming soon — AI generation grounded on persona data."
            className="mb-4 flex w-full items-center justify-between rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-inset)] px-4 py-3 text-left opacity-70"
          >
            <span>
              <span className="block text-sm font-bold text-[var(--text-primary)]">Generate creative with Arc ▸</span>
              <span className="block text-xs text-[var(--text-muted)]">Coming soon — AI generation grounded on persona data.</span>
            </span>
          </button>

          <form action={formAction} className="space-y-3">
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="assetId" value={targetAssetId ?? ""} />

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Target asset</span>
              <select
                value={targetAssetId ?? ""}
                onChange={(event) => onSelectAsset(event.target.value)}
                disabled={!hasAssets}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
              >
                {hasAssets ? (
                  assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.title} / {asset.channel}
                    </option>
                  ))
                ) : (
                  <option value="">No assets to revise yet</option>
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Instruction</span>
              <textarea
                name="instruction"
                rows={6}
                placeholder="e.g. Make the email shorter and add a referral CTA."
                disabled={!hasAssets}
                className="w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
              />
            </label>

            <Button type="submit" variant="primary" size="md" disabled={!hasAssets || isPending} className="w-full">
              {isPending ? "Sending to Arc..." : "Send to Arc"}
            </Button>

            {state ? (
              <p
                className={`rounded-lg border px-3 py-2 text-sm ${
                  state.ok
                    ? "border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]"
                    : "border-[oklch(0.68_0.2_26/0.45)] bg-[oklch(0.68_0.2_26/0.14)] text-[oklch(0.86_0.09_26)]"
                }`}
              >
                {state.message}
              </p>
            ) : null}
          </form>

          {events.length > 0 ? (
            <div className="mt-6 border-t border-[var(--border-hairline)] pt-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Activity</div>
              <ul className="space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[var(--text-primary)]">{event.type}</span>
                      <span className="text-xs text-[var(--text-muted)]">{event.occurredAt}</span>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">{event.actor}:</span> {event.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the new file**

Run: `pnpm lint`
Expected: PASS. The file is not yet imported; type-aware lint still validates it. The drawer takes discrete props (no `context` object), so no shared context type is introduced here — `DecisionContext` (Task 1) is the only intel-context type.

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/arc-drawer.tsx
git commit -m "feat(campaigns): slide-over Arc drawer with enlarged revise form + activity"
```

---

## Task 3: Wire the workspace (full-width, drawer state, trigger)

**Files:**
- Modify: `src/app/campaigns/_components/campaign-workspace.tsx`

- [ ] **Step 1: Swap imports**

Replace the `MarkRail` import with the new components. Change:

```tsx
import { MarkRail } from "./arc-rail";
```

to:

```tsx
import { DecisionContextBar } from "./decision-context-bar";
import { MarkDrawer } from "./arc-drawer";
```

- [ ] **Step 2: Add drawer open state and repoint `pickAsset`**

In the component body, after the existing `targetAssetId` state line (`campaign-workspace.tsx:26`), add:

```tsx
  const [markOpen, setMarkOpen] = useState(false);
```

Replace the existing `pickAsset` function (`campaign-workspace.tsx:38-41`):

```tsx
  function pickAsset(assetId: string) {
    setTargetAssetId(assetId);
    setActiveTab("creative");
  }
```

with one that opens the drawer pre-targeted:

```tsx
  function pickAsset(assetId: string) {
    setTargetAssetId(assetId);
    setMarkOpen(true);
  }
```

- [ ] **Step 3: Insert the DecisionContextBar after the MetricStrip**

Immediately after the closing `/>` of `<MetricStrip ... />` (ends at `campaign-workspace.tsx:54`) and before the `pendingApproval` block, insert:

```tsx
      <DecisionContextBar
        context={{
          persona: campaign.persona,
          leadsCount: sources.filter((source) => source.kind === "lead").length,
          tools: reasoning.toolsUsed,
          whyBuilt: reasoning.whyBuilt,
        }}
      />
```

- [ ] **Step 4: Make the content full-width and add the Arc trigger in the tab row**

Replace the grid wrapper opening (`campaign-workspace.tsx:68-69`):

```tsx
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
```

with a single full-width column:

```tsx
      <div className="min-w-0">
        <div className="min-w-0">
```

Then, in the tablist row, add a "Chat with Arc" trigger aligned to the right. Change the `role="tablist"` container's className to push the button to the end and add the button as the last child inside that row. Replace:

```tsx
          <div role="tablist" className="mb-4 flex flex-wrap gap-2 border-b border-[var(--border-hairline)] pb-3">
            {tabs.map((tab) => {
```

with:

```tsx
          <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
            <div role="tablist" className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
```

and close the new inner `tablist` wrapper + add the trigger immediately after the `tabs.map(...)` closing `)}` and before the row's closing `</div>`. Locate the end of the map (`campaign-workspace.tsx:92`, the `})}` that closes `{tabs.map(...)}`) and the `</div>` after it; replace:

```tsx
            })}
          </div>
```

with:

```tsx
            })}
            </div>
            <button
              type="button"
              onClick={() => setMarkOpen(true)}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-strong)]"
            >
              Chat with Arc
            </button>
          </div>
```

- [ ] **Step 5: Replace the `<MarkRail .../>` block and close the layout**

Replace the entire `<MarkRail ... />` element plus the grid-closing `</div>` (`campaign-workspace.tsx:104-116`):

```tsx
        <MarkRail
          campaignId={campaign.id}
          assets={assets.map((asset) => ({ id: asset.id, title: asset.title, channel: asset.channel }))}
          targetAssetId={targetAssetId}
          onSelectAsset={setTargetAssetId}
          context={{
            persona: campaign.persona,
            leadsCount: sources.filter((source) => source.kind === "lead").length,
            tools: reasoning.toolsUsed,
            whyBuilt: reasoning.whyBuilt,
          }}
        />
      </div>
```

with the closing of the full-width column plus the drawer mounted once:

```tsx
        </div>
      </div>

      <MarkDrawer
        open={markOpen}
        onClose={() => setMarkOpen(false)}
        campaignId={campaign.id}
        assets={assets.map((asset) => ({ id: asset.id, title: asset.title, channel: asset.channel }))}
        targetAssetId={targetAssetId}
        onSelectAsset={setTargetAssetId}
        events={detail.events}
      />
```

Note: `detail.events` is already available — `detail` is the `LiveCampaignWorkspace` prop and `events` is one of its fields (`read-model.ts:155`). If preferred, destructure `events` alongside the others on `campaign-workspace.tsx:24`.

- [ ] **Step 6: Lint and build**

Run: `pnpm lint`
Expected: PASS, no unused-import warning for `MarkRail` (its import was removed), no reference errors.

Run: `pnpm build`
Expected: Compiles successfully. TypeScript confirms `detail.events` matches `CampaignWorkspaceEvent[]` and all new props line up.

- [ ] **Step 7: Commit**

```bash
git add src/app/campaigns/_components/campaign-workspace.tsx
git commit -m "feat(campaigns): full-width workspace with intel bar + Arc drawer trigger"
```

---

## Task 4: Remove the dead MarkRail

**Files:**
- Delete: `src/app/campaigns/_components/arc-rail.tsx`

- [ ] **Step 1: Confirm nothing else imports it**

Run: `git grep -n "arc-rail\|MarkRail" -- src/`
Expected: No matches (Task 3 removed the only import).

- [ ] **Step 2: Delete the file**

```bash
git rm src/app/campaigns/_components/arc-rail.tsx
```

- [ ] **Step 3: Lint and build to confirm no dangling references**

Run: `pnpm lint && pnpm build`
Expected: Both PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(campaigns): remove superseded MarkRail"
```

---

## Task 5: End-to-end verification (operator view)

**Files:**
- Verify (no change expected): `src/app/campaigns/_components/creative-tab.tsx`

- [ ] **Step 1: Confirm creative-tab still routes through `onPickAsset`**

Run: `git grep -n "onPickAsset\|onPick" -- src/app/campaigns/_components/creative-tab.tsx`
Expected: The per-asset button's `onClick={onPick}` (which calls `onPickAsset(asset.id)`) is intact. No edit needed — it now opens the drawer via the repointed `pickAsset`.

- [ ] **Step 2: Run the app and verify the redesign**

Run: `pnpm dev`, open a campaign workspace at `/campaigns/<id>` (seed with `pnpm seed:arc-demo` if no live campaigns), and confirm:
- The right rail is gone; the tabbed content spans full width.
- A slim "Growth intelligence" bar sits under the metric strip; "Details ▾" expands the full `IntelligencePanel` and "Hide details ▴" collapses it.
- "Chat with Arc" (right of the tabs) opens the slide-over drawer; the scrim, the Close button, and the `Esc` key all dismiss it; body scroll is locked while open.
- On the Creative tab, an asset card's "Ask Arc to revise" opens the drawer with that asset pre-selected in the Target asset dropdown.
- Submitting an instruction returns the existing revision-request result banner (success or the not-configured/validation message) and leaves the "Outbound locked" posture unchanged.
- The "Generate creative with Arc ▸" row is visibly present but disabled.

- [ ] **Step 3: Final lint + build gate**

Run: `pnpm lint && pnpm build`
Expected: Both PASS. This is the authoritative automated check (no component unit-test harness exists; `src/domain` is untouched so `pnpm test` needs no new cases).

- [ ] **Step 4: Commit any verification-driven tweaks**

```bash
git add -A
git commit -m "test(campaigns): verify slim-intel + Arc drawer redesign"
```

(If Steps 1–3 surfaced no issues, skip this commit.)

---

## Self-Review notes

- **Spec coverage:** rail removal + full-width (Task 3); slim intel bar + disclosure (Task 1, mounted Task 3); larger Arc drawer with per-asset + campaign-wide open (Tasks 2–3); activity thread (Task 2 via `detail.events`); disabled Gemini/Veo/Nano hook (Task 2); `arc-rail.tsx` removal (Task 4); `IntelligencePanel`/`requestRevisionAction`/auth unchanged (reused verbatim). Follow-up generation work is explicitly out of scope per spec.
- **No new design tokens or backend changes** — every class uses existing CSS vars; the intel model in Task 1 is copied verbatim from `arc-rail.tsx:36-53` to preserve identical content.
- **Type consistency:** `DecisionContext` (Task 1) and `MarkContext` (Task 2) share the same shape as the old `MarkRailContext`; `events` is typed `CampaignWorkspaceEvent[]` everywhere, sourced from `LiveCampaignWorkspace.events`.
