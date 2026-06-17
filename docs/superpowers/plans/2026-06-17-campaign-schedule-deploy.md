# Schedule Campaign Deploys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator schedule a campaign deploy (single piece or whole campaign) for a future time, recording it as a `"scheduled"` dispatch with `scheduled_for` and handing off to Arc — the app never sends.

**Architecture:** Wire an optional `scheduledFor` through the existing deploy path: a pure domain validator → the deploy server actions → `deployAsset`/`launchCampaign` → `enqueueDispatchesForAssets` (which inserts `"scheduled"` instead of `"queued"` when a time is given). The launchpad gains a Now/Schedule toggle. No schema change — `scheduled_for` + the `"scheduled"` status already exist.

**Tech Stack:** Next.js 16 (RSC + `useActionState` client islands), React 19, TypeScript, Vitest, Supabase, Tailwind tokens.

**Design reference:** `docs/superpowers/specs/2026-06-17-campaign-schedule-deploy-design.md`

---

## Context an implementer needs

- **Read the spec first.** Scheduling is **record-intent only** — the app performs no send. The operator's deploy/schedule click is the human approval gate. Reschedule/cancel is the existing Outbox; do not build it here.
- **No migration:** `DispatchStatus` already includes `"scheduled"` and `campaign_dispatches.scheduled_for` already exists (`src/lib/dispatch/status.ts`).
- **`@/domain` re-export style:** `src/domain/index.ts` is a list of `export * from "./module";` lines. Add one for the new module.
- **Deploy path today:**
  - `src/app/campaigns/actions.ts`: `deployAssetAction` (reads `assetId`,`campaignId`) → `deployAsset`; `launchCampaignAction` (reads `campaignId`) → `launchCampaign`. Both shaped for `useActionState`, return `{ ok, message } | null`.
  - `src/lib/campaigns/launch.ts`: `deployAsset({ campaignId, assetId, operator, agentName? })` and `launchCampaign({ campaignId, operator, agentName? })` both call `enqueueDispatchesForAssets({ campaignId, assetIds, operator }, client)` and then insert an `asset_deployed` / `campaign_launched` event.
  - `src/lib/dispatch/persistence.ts`: `enqueueDispatchesForAssets` inserts one `campaign_dispatches` row (`status: "queued"`) + one `campaign_events` row (`dispatch_queued`) per asset.
- **The launchpad** (`src/app/campaigns/_components/campaign-deploy-launchpad.tsx`) is a `"use client"` component. `DeployPieceButton` wraps `deployAssetAction`; `DeployCampaignButton` wraps `launchCampaignAction` with a two-click confirm. `PieceActions` renders a `deployed` mode ("Queued in Outbox" + Outbox link). It receives `dispatches: DispatchView[]` already.
- **`DispatchView`** (`src/lib/dispatch/status.ts`): `{ id, assetId, status, scheduledFor, ... }`. Note: `scheduledFor` is already date-formatted (YYYY-MM-DD) by the read-model — display it as-is.
- **Test mock:** `createSupabaseQueryMock` from `@/lib/repos/__tests__/test-helpers` (see `src/lib/dispatch/persistence.test.ts` for usage: keyed by table → `{ data, error }`, and `supabase.calls` records `["insert", arg]` etc.).
- **Commands:** `pnpm test <file>`, `pnpm build` (types), `pnpm lint <files>` (scope to changed files — repo-wide floods vendored output).
- **Design rules** (`DESIGN.md`): canonical `Button`, inset surfaces for inputs, no emojis.

## File structure

**New**
- `src/domain/dispatch-scheduling.ts` — `validateScheduledFor` + `ScheduledForError`.
- `src/domain/__tests__/dispatch-scheduling.test.ts` — validator tests.

**Modified**
- `src/domain/index.ts` — `export * from "./dispatch-scheduling";`
- `src/lib/dispatch/persistence.ts` — optional `scheduledFor` in `enqueueDispatchesForAssets`.
- `src/lib/dispatch/persistence.test.ts` — scheduled-path coverage.
- `src/lib/campaigns/launch.ts` — thread `scheduledFor` through `deployAsset`/`launchCampaign`.
- `src/app/campaigns/actions.ts` — read + validate `scheduledFor` in both deploy actions.
- `src/app/campaigns/_components/campaign-deploy-launchpad.tsx` — Now/Schedule toggle + scheduled state.

---

## Task 1: Domain validator

**Files:**
- Create: `src/domain/dispatch-scheduling.ts`
- Test: `src/domain/__tests__/dispatch-scheduling.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/dispatch-scheduling.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ScheduledForError, validateScheduledFor } from "../dispatch-scheduling";

const now = new Date("2026-06-17T12:00:00Z");

describe("validateScheduledFor", () => {
  it("accepts a future time and returns a normalized ISO string", () => {
    expect(validateScheduledFor("2026-06-18T09:00:00Z", now)).toBe("2026-06-18T09:00:00.000Z");
  });

  it("normalizes a datetime-local (no zone) value to ISO", () => {
    // parsed in the host's local zone, then serialized to UTC — just assert it round-trips to a valid ISO in the future
    const out = validateScheduledFor("2026-12-01T08:30", now);
    expect(out).toMatch(/^2026-12-01T\d{2}:30:00\.000Z$/);
  });

  it("rejects a past time", () => {
    expect(() => validateScheduledFor("2026-06-16T09:00:00Z", now)).toThrow(ScheduledForError);
  });

  it("rejects exactly now", () => {
    expect(() => validateScheduledFor("2026-06-17T12:00:00Z", now)).toThrow(ScheduledForError);
  });

  it("rejects blank / non-string / unparseable values", () => {
    expect(() => validateScheduledFor("", now)).toThrow(ScheduledForError);
    expect(() => validateScheduledFor("   ", now)).toThrow(ScheduledForError);
    expect(() => validateScheduledFor(undefined, now)).toThrow(ScheduledForError);
    expect(() => validateScheduledFor(42, now)).toThrow(ScheduledForError);
    expect(() => validateScheduledFor("not a date", now)).toThrow(ScheduledForError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/domain/__tests__/dispatch-scheduling.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the validator**

Create `src/domain/dispatch-scheduling.ts`:

```ts
/** Operator-supplied deploy schedule time was missing or invalid. */
export class ScheduledForError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledForError";
  }
}

/**
 * Validate an operator-supplied deploy schedule time. Returns the normalized ISO
 * (UTC) string. `now` is injected for testability. Throws ScheduledForError when the
 * value is absent/blank, not a string, unparseable, or not strictly in the future.
 * Deploy-now does not call this — there is no value to validate.
 */
export function validateScheduledFor(value: unknown, now: Date): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ScheduledForError("Pick a date and time to schedule the deploy.");
  }
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) {
    throw new ScheduledForError("That date and time isn't valid.");
  }
  if (when.getTime() <= now.getTime()) {
    throw new ScheduledForError("Pick a time in the future.");
  }
  return when.toISOString();
}
```

- [ ] **Step 4: Re-export from the domain barrel**

In `src/domain/index.ts`, add this line at the end (with the other `export *` lines):

```ts
export * from "./dispatch-scheduling";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/domain/__tests__/dispatch-scheduling.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/dispatch-scheduling.ts src/domain/__tests__/dispatch-scheduling.test.ts src/domain/index.ts
git commit -m "feat(domain): validateScheduledFor for deploy scheduling"
```

---

## Task 2: Persistence — schedule-aware enqueue

**Files:**
- Modify: `src/lib/dispatch/persistence.ts`
- Test: `src/lib/dispatch/persistence.test.ts`

**IMPORTANT:** Do NOT add `"scheduled"` to the `EVENT_FOR_STATUS` map. That map is used by `transitionDispatch`, and an existing test (`persistence.test.ts` "does not emit an event when transitioning to scheduled") asserts no event is emitted there. `enqueueDispatchesForAssets` emits its own event row directly, independent of that map.

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe("enqueueDispatchesForAssets", ...)` block in `src/lib/dispatch/persistence.test.ts`:

```ts
  it("schedules dispatches (status + scheduled_for + dispatch_scheduled event) when scheduledFor is given", async () => {
    const supabase = createSupabaseQueryMock({
      campaign_assets: { data: [{ id: "a1", channel: "email", title: "Welcome" }], error: null },
      campaign_dispatches: { data: null, error: null },
      campaign_events: { data: null, error: null },
    });

    await enqueueDispatchesForAssets(
      { campaignId: "c1", assetIds: ["a1"], operator: "Operator", scheduledFor: "2026-07-01T09:00:00.000Z" },
      supabase,
    );

    const inserts = findCalls(supabase, "insert");
    expect(inserts).toContainEqual(
      expect.objectContaining({ campaign_asset_id: "a1", status: "scheduled", scheduled_for: "2026-07-01T09:00:00.000Z" }),
    );
    expect(inserts).toContainEqual(expect.objectContaining({ event_type: "dispatch_scheduled" }));
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/dispatch/persistence.test.ts`
Expected: FAIL — inserted row has `status: "queued"`, no `scheduled_for`, event is `dispatch_queued`.

- [ ] **Step 3: Implement**

In `src/lib/dispatch/persistence.ts`, change the `EnqueueInput` type and the insert loop. Replace:

```ts
export type EnqueueInput = { campaignId: string; assetIds: string[]; operator: string };
```
with:
```ts
export type EnqueueInput = { campaignId: string; assetIds: string[]; operator: string; scheduledFor?: string };
```

Then replace the body of the `for (const asset of assets) { ... }` loop with:

```ts
  const scheduled = Boolean(input.scheduledFor);
  for (const asset of assets) {
    const { error: insertError } = await client.from("campaign_dispatches").insert({
      campaign_id: campaignId,
      campaign_asset_id: asset.id,
      channel: asset.channel,
      status: scheduled ? "scheduled" : "queued",
      ...(scheduled ? { scheduled_for: input.scheduledFor } : {}),
      payload: { source: "campaign_launch", deliverable: asset.title },
    });
    assertOk("campaign_dispatches insert", insertError);

    const { error: eventError } = await client.from("campaign_events").insert({
      campaign_id: campaignId,
      campaign_asset_id: asset.id,
      event_type: scheduled ? "dispatch_scheduled" : "dispatch_queued",
      actor: operator,
      detail: scheduled
        ? `Scheduled "${asset.title}" for ${input.scheduledFor}.`
        : `Queued "${asset.title}" for dispatch.`,
      payload: { channel: asset.channel, ...(scheduled ? { scheduled_for: input.scheduledFor } : {}) },
    });
    assertOk("campaign_events insert", eventError);
  }
```

(The existing destructure `const { campaignId, assetIds, operator } = input;` stays; `input.scheduledFor` is read directly.)

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test src/lib/dispatch/persistence.test.ts`
Expected: PASS — the new scheduled test plus all existing queued/transition tests (including "does not emit an event when transitioning to scheduled", which is untouched).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dispatch/persistence.ts src/lib/dispatch/persistence.test.ts
git commit -m "feat(dispatch): enqueue scheduled dispatches when scheduledFor is given"
```

---

## Task 3: Thread `scheduledFor` through the launch flow

**Files:**
- Modify: `src/lib/campaigns/launch.ts`

- [ ] **Step 1: Extend the input types**

In `src/lib/campaigns/launch.ts`, add `scheduledFor?: string` to both input types:

```ts
export type LaunchCampaignInput = {
  campaignId: string;
  operator: string;
  agentName?: string;
  /** When set, deliverables are enqueued "scheduled" for this ISO time instead of "queued". */
  scheduledFor?: string;
};
```
and
```ts
export type DeployAssetInput = {
  campaignId: string;
  assetId: string;
  operator: string;
  agentName?: string;
  /** When set, the deliverable is enqueued "scheduled" for this ISO time instead of "queued". */
  scheduledFor?: string;
};
```

- [ ] **Step 2: Thread it through `launchCampaign`**

In `launchCampaign`, change the destructure line:
```ts
  const { campaignId, operator, agentName = "Arc" } = input;
```
to:
```ts
  const { campaignId, operator, agentName = "Arc", scheduledFor } = input;
```
Change the enqueue call from:
```ts
  await enqueueDispatchesForAssets({ campaignId, assetIds: approvedAssetIds, operator }, client);
```
to:
```ts
  await enqueueDispatchesForAssets({ campaignId, assetIds: approvedAssetIds, operator, scheduledFor }, client);
```
Change the `campaign_launched` event `detail` to note scheduling:
```ts
    detail: scheduledFor
      ? `Campaign launched by ${operator}. ${approvedAssetIds.length} deliverable${approvedAssetIds.length === 1 ? "" : "s"} scheduled for ${scheduledFor}; handed off to ${agentName}.`
      : `Campaign launched by ${operator}. ${approvedAssetIds.length} deliverable${approvedAssetIds.length === 1 ? "" : "s"} unlocked for dispatch; handed off to ${agentName}.`,
```

- [ ] **Step 3: Thread it through `deployAsset`**

In `deployAsset`, change the destructure line:
```ts
  const { campaignId, assetId, operator, agentName = "Arc" } = input;
```
to:
```ts
  const { campaignId, assetId, operator, agentName = "Arc", scheduledFor } = input;
```
Change the enqueue call from:
```ts
  await enqueueDispatchesForAssets({ campaignId, assetIds: [assetId], operator }, client);
```
to:
```ts
  await enqueueDispatchesForAssets({ campaignId, assetIds: [assetId], operator, scheduledFor }, client);
```
Change the `asset_deployed` event `detail`:
```ts
    detail: scheduledFor
      ? `Deliverable scheduled for ${scheduledFor} by ${operator}; handed off to ${agentName}.`
      : `Deliverable deployed by ${operator}; handed off to ${agentName} for dispatch.`,
```

- [ ] **Step 4: Verify existing launch tests still pass**

Run: `pnpm test src/lib/campaigns/launch.test.ts`
Expected: PASS — existing callers pass no `scheduledFor` (undefined → unchanged queued path + original event detail).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm build`
Expected: no type errors.
```bash
git add src/lib/campaigns/launch.ts
git commit -m "feat(campaigns): thread scheduledFor through deploy/launch"
```

---

## Task 4: Read + validate `scheduledFor` in the deploy actions

**Files:**
- Modify: `src/app/campaigns/actions.ts`

- [ ] **Step 1: Add the import**

At the top of `src/app/campaigns/actions.ts`, add `ScheduledForError` and `validateScheduledFor` to the existing `@/domain` import (the file already imports from `@/domain` — extend that import list rather than adding a new line):

```ts
import {
  CampaignDraftValidationError,
  parseCampaignDraft,
  RevisionInstructionError,
  ScheduledForError,
  validateRevisionInstruction,
  validateScheduledFor,
} from "@/domain";
```
(Match the file's existing import members; just ensure `ScheduledForError` and `validateScheduledFor` are included.)

- [ ] **Step 2: Validate + pass in `deployAssetAction`**

In `deployAssetAction`, after the `assetId`/`campaignId` reads and the `if (!assetId) {...}` guard, add:

```ts
  const scheduledForRaw = String(formData.get("scheduledFor") ?? "").trim();
  let scheduledFor: string | undefined;
  if (scheduledForRaw) {
    try {
      scheduledFor = validateScheduledFor(scheduledForRaw, new Date());
    } catch (error) {
      if (error instanceof ScheduledForError) return { ok: false, message: error.message };
      throw error;
    }
  }
```
Change the `deployAsset` call to pass it:
```ts
    await deployAsset({ campaignId, assetId, operator: getOperatorActor(), agentName, scheduledFor }, getSupabaseAdminClient());
```
Change the success return to reflect scheduling:
```ts
  return {
    ok: true,
    message: scheduledFor
      ? `Scheduled — handed to ${agentName}. Manage the timing in the Outbox.`
      : `Deployed — handed off to ${agentName} for dispatch.`,
  };
```

- [ ] **Step 3: Validate + pass in `launchCampaignAction`**

In `launchCampaignAction`, after the `campaignId` read + `if (!campaignId) {...}` guard, add the same validation block:

```ts
  const scheduledForRaw = String(formData.get("scheduledFor") ?? "").trim();
  let scheduledFor: string | undefined;
  if (scheduledForRaw) {
    try {
      scheduledFor = validateScheduledFor(scheduledForRaw, new Date());
    } catch (error) {
      if (error instanceof ScheduledForError) return { ok: false, message: error.message };
      throw error;
    }
  }
```
Change the `launchCampaign` call:
```ts
    ({ launchedAssets } = await launchCampaign({ campaignId, operator: getOperatorActor(), agentName, scheduledFor }, getSupabaseAdminClient()));
```
Change the success return:
```ts
  return {
    ok: true,
    message: scheduledFor
      ? `Scheduled — ${launchedAssets} deliverable${launchedAssets === 1 ? "" : "s"} handed to ${agentName}. Manage the timing in the Outbox.`
      : `Campaign launched — ${launchedAssets} deliverable${launchedAssets === 1 ? "" : "s"} handed off to ${agentName} for dispatch.`,
  };
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm build`
Expected: no type errors.
```bash
git add src/app/campaigns/actions.ts
git commit -m "feat(campaigns): accept scheduledFor in deploy/launch actions"
```

---

## Task 5: Launchpad Now/Schedule UI

**Files:**
- Modify: `src/app/campaigns/_components/campaign-deploy-launchpad.tsx`

- [ ] **Step 1: Add a local-now helper**

Near the bottom of the file (with the other module-level helpers like `statusTone`), add:

```tsx
/** Current local time as a `datetime-local`-compatible value (YYYY-MM-DDTHH:mm). */
function localNowValue(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
```

- [ ] **Step 2: Add the schedule toggle to `DeployPieceButton`**

Replace the existing `DeployPieceButton` component with:

```tsx
function DeployPieceButton({ assetId, campaignId }: { assetId: string; campaignId: string }) {
  const [state, formAction, isPending] = useActionState(deployAssetAction, null);
  const [scheduling, setScheduling] = useState(false);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      {scheduling ? (
        <input
          type="datetime-local"
          name="scheduledFor"
          min={localNowValue()}
          required
          aria-label="Schedule deploy for"
          className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 text-xs text-[var(--text-primary)]"
        />
      ) : null}
      <Button type="submit" variant="primary" size="sm" disabled={isPending}>
        {isPending ? (scheduling ? "Scheduling…" : "Deploying…") : scheduling ? "Schedule" : "Deploy"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setScheduling((s) => !s)} disabled={isPending}>
        {scheduling ? "Cancel" : "Schedule"}
      </Button>
      {state ? <ActionMessage state={state} /> : null}
    </form>
  );
}
```

- [ ] **Step 3: Add scheduling to `DeployCampaignButton`'s confirm form**

In `DeployCampaignButton`, add `const [scheduling, setScheduling] = useState(false);` alongside the existing `confirming` state. In the **confirming** branch's `<form>`, add the datetime input + toggle and adjust the confirm label. Replace the confirming-branch form body (the `<input hidden campaignId>` + confirm/cancel buttons) with:

```tsx
      <input type="hidden" name="campaignId" value={campaignId} />
      <p className="text-xs font-semibold text-[var(--text-secondary)]">
        {scheduling ? "Schedule" : "Hand"} {launchpad.readyCount} approved piece{launchpad.readyCount === 1 ? "" : "s"} to {agentName}{scheduling ? " for later?" : " to send?"}
      </p>
      {scheduling ? (
        <input
          type="datetime-local"
          name="scheduledFor"
          min={localNowValue()}
          required
          aria-label="Schedule campaign deploy for"
          className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 text-xs text-[var(--text-primary)]"
        />
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={isPending}>
          {isPending ? (scheduling ? "Scheduling…" : "Deploying…") : scheduling ? "Confirm schedule" : "Confirm deploy"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setScheduling((s) => !s)} disabled={isPending}>
          {scheduling ? "Deploy now instead" : "Schedule for later"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
      {state ? <ActionMessage state={state} /> : null}
```

(Keep the outer `<form action={formAction} className="flex shrink-0 flex-col items-end gap-2">` wrapper and the non-confirming/disabled branches unchanged.)

- [ ] **Step 4: Show the scheduled time on already-scheduled pieces**

At the top of `CampaignDeployLaunchpad`'s body (just after the existing `const isEmpty = launchpad.totalShippable === 0;` line), build a per-asset scheduled-time map from the dispatches and pass it down:

```tsx
  const scheduledByAsset = new Map(
    dispatches.filter((d) => d.status === "scheduled" && d.assetId).map((d) => [d.assetId as string, d.scheduledFor]),
  );
```

Pass it into each row — change the pieces map to:
```tsx
          <li key={piece.id}>
            <DeployPieceRow piece={piece} campaignId={campaignId} scheduledFor={scheduledByAsset.get(piece.id) ?? null} />
          </li>
```

Update `DeployPieceRow` to accept and forward it:
```tsx
function DeployPieceRow({ piece, campaignId, scheduledFor }: { piece: DeployPiece; campaignId: string; scheduledFor: string | null }) {
```
and pass `scheduledFor` into `<PieceActions piece={piece} campaignId={campaignId} scheduledFor={scheduledFor} />`.

Update `PieceActions` signature to `{ piece, campaignId, scheduledFor }: { piece: DeployPiece; campaignId: string; scheduledFor: string | null }` and, in the `piece.mode === "deployed"` branch, replace the `<StatusPill tone="blue">Queued in Outbox</StatusPill>` with:
```tsx
        <StatusPill tone="blue">{scheduledFor ? `Scheduled for ${scheduledFor}` : "Queued in Outbox"}</StatusPill>
```
(Leave the "View Outbox" link as-is.)

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm build`
Expected: no type errors. (`useState` is already imported in this client component; confirm `dispatches` is in scope in `CampaignDeployLaunchpad` — it is, it's a prop.)
```bash
git add src/app/campaigns/_components/campaign-deploy-launchpad.tsx
git commit -m "feat(campaigns): Now/Schedule toggle + scheduled state on deploy launchpad"
```

---

## Task 6: Full verification

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS, including new `dispatch-scheduling.test.ts` and the new persistence scheduled test.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 3: Scoped lint**

Run: `pnpm lint src/domain/dispatch-scheduling.ts src/lib/dispatch/persistence.ts src/lib/campaigns/launch.ts src/app/campaigns/actions.ts src/app/campaigns/_components/campaign-deploy-launchpad.tsx`
Expected: no errors in these files.

- [ ] **Step 4: Manual smoke (Supabase + seeded campaign with an approved piece)**

`pnpm dev`, open a campaign at `/campaigns/<id>`:
- Per piece: "Deploy" + "Schedule". Click Schedule → datetime input appears; pick a future time → "Schedule" → success "Scheduled — handed to <agent>…"; the piece shows "Scheduled for <date>"; `/outbox` lists it as `Scheduled`.
- Deploy-now still works (no time → `Queued`).
- "Deploy campaign" → confirm step has "Schedule for later" → datetime → "Confirm schedule".
- A past time (force via devtools) → inline error "Pick a time in the future." Nothing enqueued.

---

## Self-review notes (for the implementer)

- **Spec coverage:** Task 1 = validator; Task 2 = scheduled enqueue; Task 3 = launch threading + handoff-event wording; Task 4 = action validation + messages (both granularities); Task 5 = Now/Schedule UI + scheduled-state display. Reschedule/cancel intentionally NOT built (Outbox owns it).
- **Spec correction applied:** `EVENT_FOR_STATUS` is deliberately left untouched (the spec's "add scheduled" note would break an existing `transitionDispatch` test); `enqueueDispatchesForAssets` emits its own `dispatch_scheduled` event.
- **Type consistency:** `scheduledFor?: string` (ISO) is the same name across `EnqueueInput`, `DeployAssetInput`, `LaunchCampaignInput`, and the action validation. `validateScheduledFor(value, now)` returns ISO; actions pass `new Date()` for `now`.
- **No schema change:** `"scheduled"` status + `scheduled_for` column already exist.
- **No outbound path added:** scheduling only sets a dispatch's status/time + a handoff event; Arc/Hermes performs the send.
```
