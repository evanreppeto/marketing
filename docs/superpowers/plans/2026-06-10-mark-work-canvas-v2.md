# Live Work Canvas v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Mark Work Canvas live and editable — the operator types directly into an agent draft, sees it in a channel-true frame (Gmail / Meta / SMS / generic), and saves edits that persist to the backing `campaign_assets` row. Outbound stays locked.

**Architecture:** Pure channel classification + field resolution in `src/domain/mark-canvas.ts`; a read/write layer in `src/lib/campaigns/draft-editing.ts`; two operator-gated server actions; and client UI (`editable-field.tsx` primitive → `channel-preview.tsx` frames → `channel-artifact.tsx` live container) wired into the existing `work-canvas.tsx`. Body edits go to `campaign_assets.edited_body`; structured fields (subject/headline/CTA) go to a new `edited_fields jsonb` column, leaving Mark's `draft_body`/`prompt_inputs` pristine.

**Tech Stack:** Next.js 16 server actions, React 19 client components, Supabase (Postgres), Vitest, Tailwind with Obsidian & Gold CSS variables.

---

## File Structure

- Create: `supabase/migrations/20260610130000_campaign_asset_edited_fields.sql` — new column + enum value.
- Create: `src/domain/mark-canvas.ts` — pure channel/field logic.
- Modify: `src/domain/index.ts` — re-export the new module.
- Create: `src/domain/__tests__/mark-canvas.test.ts` — domain unit tests.
- Create: `src/lib/campaigns/draft-editing.ts` — `getDraftAsset` + `editDraftAsset`.
- Modify: `src/app/mark/actions.ts` — `getDraftAssetAction` + `editDraftAssetAction`.
- Create: `src/app/mark/_components/editable-field.tsx` — inline-edit primitive.
- Create: `src/app/mark/_components/channel-preview.tsx` — Email/Meta/SMS/Generic frames.
- Create: `src/app/mark/_components/channel-artifact.tsx` — live fetch + save container.
- Modify: `src/app/mark/_components/work-canvas.tsx` — route draft cards with a backing asset to `ChannelArtifact`.

---

## Task 1: Migration — `edited_fields` column + `asset_edited` event type

**Files:**
- Create: `supabase/migrations/20260610130000_campaign_asset_edited_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Operator edits from the Mark Work Canvas v2. Body edits live in edited_body;
-- structured fields (subject/headline/cta/primary_text) live in edited_fields so
-- Mark's original draft_body + prompt_inputs stay pristine. Outbound stays locked.
alter table public.campaign_assets
  add column if not exists edited_fields jsonb not null default '{}'::jsonb;

comment on column public.campaign_assets.edited_fields is
  'Operator-edited structured fields (subject/headline/cta/primary_text) from the Mark Work Canvas.';

-- Audit-trail event for an in-canvas edit.
alter type public.campaign_event_type add value if not exists 'asset_edited';
```

- [ ] **Step 2: Verify it parses (no DB apply required locally)**

Run: `git diff --stat supabase/migrations/20260610130000_campaign_asset_edited_fields.sql`
Expected: shows the new file. (Local dev has no Supabase; the app degrades gracefully. Do not edit shipped migrations.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610130000_campaign_asset_edited_fields.sql
git commit -m "feat(mark): add campaign_assets.edited_fields + asset_edited event"
```

---

## Task 2: Domain — `mark-canvas.ts` channel classification + field resolution (TDD)

**Files:**
- Create: `src/domain/mark-canvas.ts`
- Test: `src/domain/__tests__/mark-canvas.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/__tests__/mark-canvas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  channelPreviewKind,
  editableFieldSpec,
  isDraftEdited,
  resolveDraftFields,
} from "../mark-canvas";

describe("channelPreviewKind", () => {
  it("classifies email channels", () => {
    expect(channelPreviewKind("Email", null)).toBe("email");
    expect(channelPreviewKind("newsletter", null)).toBe("email");
    expect(channelPreviewKind(null, "email_blast")).toBe("email");
  });
  it("classifies ad channels", () => {
    expect(channelPreviewKind("Meta Ad", null)).toBe("ad");
    expect(channelPreviewKind("facebook", null)).toBe("ad");
    expect(channelPreviewKind("instagram", null)).toBe("ad");
    expect(channelPreviewKind(null, "paid_social")).toBe("ad");
  });
  it("classifies sms channels", () => {
    expect(channelPreviewKind("SMS", null)).toBe("sms");
    expect(channelPreviewKind("text message", null)).toBe("sms");
  });
  it("falls back to generic", () => {
    expect(channelPreviewKind(null, null)).toBe("generic");
    expect(channelPreviewKind("billboard", "physical")).toBe("generic");
  });
  it("does not false-positive 'ad' inside words like broadcast", () => {
    expect(channelPreviewKind("broadcast", null)).toBe("generic");
  });
});

describe("editableFieldSpec", () => {
  it("email exposes subject + body", () => {
    expect(editableFieldSpec("email").map((f) => f.key)).toEqual(["subject", "body"]);
  });
  it("ad exposes primaryText + headline + cta", () => {
    expect(editableFieldSpec("ad").map((f) => f.key)).toEqual(["primaryText", "headline", "cta"]);
  });
  it("sms exposes body only", () => {
    expect(editableFieldSpec("sms").map((f) => f.key)).toEqual(["body"]);
  });
  it("generic exposes title + body", () => {
    expect(editableFieldSpec("generic").map((f) => f.key)).toEqual(["title", "body"]);
  });
});

describe("resolveDraftFields", () => {
  it("prefers edited over prompt_inputs over draft", () => {
    const fields = resolveDraftFields({
      title: "T",
      draftBody: "draft body",
      editedBody: "edited body",
      promptInputs: { subject: "PI subject", headline: "PI headline" },
      editedFields: { subject: "Edited subject" },
    });
    expect(fields.body).toBe("edited body");
    expect(fields.subject).toBe("Edited subject");
    expect(fields.headline).toBe("PI headline");
  });
  it("falls back to draft body when no edited body", () => {
    const fields = resolveDraftFields({
      title: null,
      draftBody: "draft body",
      editedBody: null,
      promptInputs: {},
      editedFields: {},
    });
    expect(fields.body).toBe("draft body");
  });
  it("reads cta synonyms from prompt_inputs", () => {
    const fields = resolveDraftFields({
      title: null,
      draftBody: "",
      editedBody: null,
      promptInputs: { call_to_action: "Book now" },
      editedFields: {},
    });
    expect(fields.cta).toBe("Book now");
  });
  it("returns empty-string body when nothing present", () => {
    const fields = resolveDraftFields({
      title: null,
      draftBody: null,
      editedBody: null,
      promptInputs: {},
      editedFields: {},
    });
    expect(fields.body).toBe("");
  });
});

describe("isDraftEdited", () => {
  it("true when edited_body present", () => {
    expect(isDraftEdited({ editedBody: "x", editedFields: {} })).toBe(true);
  });
  it("true when edited_fields non-empty", () => {
    expect(isDraftEdited({ editedBody: null, editedFields: { subject: "x" } })).toBe(true);
  });
  it("false when neither", () => {
    expect(isDraftEdited({ editedBody: null, editedFields: {} })).toBe(false);
    expect(isDraftEdited({ editedBody: "", editedFields: {} })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/domain/__tests__/mark-canvas.test.ts`
Expected: FAIL — `Cannot find module '../mark-canvas'`.

- [ ] **Step 3: Implement `src/domain/mark-canvas.ts`**

```ts
/**
 * Pure logic for the Live Work Canvas. No I/O. Classifies an asset's channel into
 * a preview frame, declares which fields each frame exposes for inline editing, and
 * resolves the editable field values from a persisted draft (operator edits win over
 * Mark's original prompt_inputs / draft_body).
 */

export type ChannelPreviewKind = "email" | "ad" | "sms" | "generic";

export type EditableFieldKey = "subject" | "primaryText" | "headline" | "cta" | "body" | "title";

export type EditableFieldSpec = {
  key: EditableFieldKey;
  label: string;
  multiline: boolean;
  placeholder: string;
  maxLength?: number;
};

export type ResolvedDraftFields = {
  title?: string;
  subject?: string;
  primaryText?: string;
  headline?: string;
  body: string;
  cta?: string;
};

export type DraftAssetRaw = {
  title: string | null;
  draftBody: string | null;
  editedBody: string | null;
  promptInputs: Record<string, unknown> | null;
  editedFields: Record<string, unknown> | null;
};

/** Map a channel/asset_type to a preview frame. Deterministic, case-insensitive. */
export function channelPreviewKind(channel: string | null, assetType: string | null): ChannelPreviewKind {
  const hay = `${channel ?? ""} ${assetType ?? ""}`.toLowerCase();
  if (/\b(sms|mms)\b/.test(hay) || /\btext\b/.test(hay)) return "sms";
  if (/(email|newsletter|mail)/.test(hay)) return "email";
  if (/\bads?\b/.test(hay) || /(advert|meta|facebook|instagram|paid|social)/.test(hay)) return "ad";
  return "generic";
}

/** Ordered editable fields per frame. */
export function editableFieldSpec(kind: ChannelPreviewKind): EditableFieldSpec[] {
  switch (kind) {
    case "email":
      return [
        { key: "subject", label: "Subject", multiline: false, placeholder: "Subject line", maxLength: 160 },
        { key: "body", label: "Body", multiline: true, placeholder: "Write the email…" },
      ];
    case "ad":
      return [
        { key: "primaryText", label: "Primary text", multiline: true, placeholder: "Primary text…" },
        { key: "headline", label: "Headline", multiline: false, placeholder: "Headline", maxLength: 80 },
        { key: "cta", label: "Button", multiline: false, placeholder: "Learn More", maxLength: 24 },
      ];
    case "sms":
      return [{ key: "body", label: "Message", multiline: true, placeholder: "Write the text…", maxLength: 480 }];
    case "generic":
    default:
      return [
        { key: "title", label: "Title", multiline: false, placeholder: "Title" },
        { key: "body", label: "Body", multiline: true, placeholder: "Body…" },
      ];
  }
}

function pick(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

/** Resolve editable field values; operator edits win over prompt_inputs over draft. */
export function resolveDraftFields(raw: DraftAssetRaw): ResolvedDraftFields {
  const ef = raw.editedFields ?? {};
  const pi = raw.promptInputs ?? {};
  const body = raw.editedBody ?? raw.draftBody ?? "";
  return {
    title: pick(ef.title, raw.title ?? undefined, pi.title),
    subject: pick(ef.subject, pi.subject),
    primaryText: pick(ef.primaryText, pi.primaryText, pi.primary_text),
    headline: pick(ef.headline, pi.headline),
    cta: pick(ef.cta, pi.cta, pi.call_to_action, pi.primary_cta),
    body: body ?? "",
  };
}

/** True when the operator has saved any edit (drives the "Edited" pill). */
export function isDraftEdited(raw: Pick<DraftAssetRaw, "editedBody" | "editedFields">): boolean {
  if (typeof raw.editedBody === "string" && raw.editedBody.length > 0) return true;
  return Object.keys(raw.editedFields ?? {}).length > 0;
}
```

- [ ] **Step 4: Re-export from the domain barrel**

In `src/domain/index.ts`, add after the existing `export * from "./mark-chat";` line:

```ts
export * from "./mark-canvas";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/domain/__tests__/mark-canvas.test.ts`
Expected: PASS (all suites green).

- [ ] **Step 6: Commit**

```bash
git add src/domain/mark-canvas.ts src/domain/__tests__/mark-canvas.test.ts src/domain/index.ts
git commit -m "feat(mark): pure channel-preview classification + draft field resolution"
```

---

## Task 3: Lib — `draft-editing.ts` read/write layer

**Files:**
- Create: `src/lib/campaigns/draft-editing.ts`

- [ ] **Step 1: Implement the read/write layer**

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  channelPreviewKind,
  isDraftEdited,
  resolveDraftFields,
  type ChannelPreviewKind,
  type ResolvedDraftFields,
} from "@/domain";

import { getSupabaseAdminClient } from "../supabase/server";

export type DraftAssetView = {
  assetId: string;
  campaignId: string;
  channel: string;
  kind: ChannelPreviewKind;
  fields: ResolvedDraftFields;
  edited: boolean;
  status: string;
  dispatchLocked: boolean;
};

type AssetRow = {
  id: string;
  campaign_id: string;
  channel: string | null;
  asset_type: string | null;
  title: string | null;
  status: string;
  dispatch_locked: boolean;
  draft_body: string | null;
  edited_body: string | null;
  prompt_inputs: Record<string, unknown> | null;
  edited_fields: Record<string, unknown> | null;
};

const ASSET_COLUMNS =
  "id, campaign_id, channel, asset_type, title, status, dispatch_locked, draft_body, edited_body, prompt_inputs, edited_fields";

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label} failed: ${error.message}`);
}

/** Load the live editable view of a draft asset (or null if missing). */
export async function getDraftAsset(
  assetId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<DraftAssetView | null> {
  const { data, error } = await client
    .from("campaign_assets")
    .select(ASSET_COLUMNS)
    .eq("id", assetId)
    .maybeSingle<AssetRow>();
  assertOk("campaign_assets draft lookup", error);
  if (!data) return null;

  const raw = {
    title: data.title,
    draftBody: data.draft_body,
    editedBody: data.edited_body,
    promptInputs: data.prompt_inputs,
    editedFields: data.edited_fields,
  };
  return {
    assetId: data.id,
    campaignId: data.campaign_id,
    channel: data.channel ?? data.asset_type ?? "",
    kind: channelPreviewKind(data.channel, data.asset_type),
    fields: resolveDraftFields(raw),
    edited: isDraftEdited(raw),
    status: data.status,
    dispatchLocked: data.dispatch_locked,
  };
}

export type EditDraftAssetInput = {
  assetId: string;
  campaignId: string;
  title?: string;
  body?: string;
  fields: Record<string, string>;
};

/**
 * Persist an operator's in-canvas edit: body -> edited_body, structured fields ->
 * edited_fields (+ title when present), and log an `asset_edited` event. Never
 * touches dispatch_locked / launch_locked — outbound stays locked.
 */
export async function editDraftAsset(
  input: EditDraftAssetInput,
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { assetId, campaignId, title, body, fields } = input;

  // Keep only non-empty structured fields so edited_fields stays a clean signal.
  const cleanFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && value.trim()) cleanFields[key] = value;
  }

  const update: Record<string, unknown> = {
    edited_fields: cleanFields,
    updated_at: new Date().toISOString(),
  };
  if (typeof body === "string") update.edited_body = body;
  if (typeof title === "string" && title.trim()) update.title = title.trim();

  const { error: assetError } = await client.from("campaign_assets").update(update).eq("id", assetId);
  assertOk("campaign_assets edit", assetError);

  const editedKeys = Object.keys(cleanFields);
  const parts = [...editedKeys];
  if (typeof body === "string") parts.push("body");
  const detail = `Draft edited by ${operator}${parts.length ? `: ${parts.join(", ")}` : ""}`;

  const { error: eventError } = await client.from("campaign_events").insert({
    campaign_id: campaignId || null,
    campaign_asset_id: assetId,
    event_type: "asset_edited",
    actor: operator,
    detail,
    payload: { edited_fields: editedKeys, body_edited: typeof body === "string", outbound_locked: true },
  });
  assertOk("campaign_events insert", eventError);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build` (or rely on Task 9's full verification). Confirm no TS errors from this file.
Expected: no errors referencing `draft-editing.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaigns/draft-editing.ts
git commit -m "feat(mark): draft-editing read/write layer (getDraftAsset + editDraftAsset)"
```

---

## Task 4: Actions — `getDraftAssetAction` + `editDraftAssetAction`

**Files:**
- Modify: `src/app/mark/actions.ts`

- [ ] **Step 1: Add imports**

At the top of `src/app/mark/actions.ts`, add to the existing import block from the campaigns libs (next to the `decideAsset` import on the line `import { type ApprovalDecision, decideAsset } from "@/lib/campaigns/decisions";`):

```ts
import { editDraftAsset, getDraftAsset, type DraftAssetView } from "@/lib/campaigns/draft-editing";
```

- [ ] **Step 2: Add the two actions at the end of the file**

Append to `src/app/mark/actions.ts`:

```ts
/** Load the live editable view of a draft asset for the Work Canvas. Operator-gated. */
export async function getDraftAssetAction(assetId: string): Promise<DraftAssetView | null> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return null;
  const id = assetId.trim();
  if (!id) return null;
  try {
    return await getDraftAsset(id);
  } catch {
    return null;
  }
}

export type EditDraftState = { ok: boolean; message: string };

/**
 * Persist an in-canvas edit to a draft asset (body -> edited_body, structured fields ->
 * edited_fields). Operator-gated; outbound stays locked. Revalidates Mark + Campaigns.
 */
export async function editDraftAssetAction(input: {
  assetId: string;
  campaignId: string;
  title?: string;
  body?: string;
  fields: Record<string, string>;
}): Promise<EditDraftState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase isn't configured yet." };

  const assetId = input.assetId?.trim();
  if (!assetId) return { ok: false, message: "Missing asset." };

  try {
    await editDraftAsset(
      {
        assetId,
        campaignId: input.campaignId?.trim() ?? "",
        title: input.title,
        body: input.body,
        fields: input.fields ?? {},
      },
      getOperatorActor(),
    );
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the edit." };
  }

  revalidatePath("/mark");
  revalidatePath("/campaigns");
  if (input.campaignId?.trim()) revalidatePath(`/campaigns/${input.campaignId.trim()}`);
  return { ok: true, message: "Saved." };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build` (or defer to Task 9). Confirm `getOperatorActor`, `requireOperator`, `isSupabaseAdminConfigured`, and `revalidatePath` are already imported in this file (they are — used by existing actions).
Expected: no new TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/mark/actions.ts
git commit -m "feat(mark): getDraftAssetAction + editDraftAssetAction (operator-gated)"
```

---

## Task 5: UI — `editable-field.tsx` inline-edit primitive

**Files:**
- Create: `src/app/mark/_components/editable-field.tsx`

- [ ] **Step 1: Implement the primitive**

Renders styled text that becomes an auto-growing textarea/input on focus. Parent owns the value; this only reports changes. Gold focus ring; no internal persistence.

```tsx
"use client";

import { useEffect, useRef } from "react";

import { cx } from "@/app/_components/theme";

type EditableFieldProps = {
  value: string;
  onChange: (next: string) => void;
  multiline: boolean;
  placeholder: string;
  maxLength?: number;
  ariaLabel: string;
  /** Visual treatment of the rendered text (defaults to body copy). */
  className?: string;
};

/**
 * Inline-editable text. Looks like plain styled text; on focus it is a real input
 * with a gold ring. Auto-grows for multiline. The parent holds state + Save — this
 * never persists on its own.
 */
export function EditableField({
  value,
  onChange,
  multiline,
  placeholder,
  maxLength,
  ariaLabel,
  className,
}: EditableFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !multiline) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, multiline]);

  const base =
    "w-full resize-none bg-transparent outline-none placeholder:text-[var(--text-muted)] " +
    "rounded-[6px] -mx-1 px-1 transition focus:bg-[var(--surface-inset)] " +
    "focus:shadow-[inset_0_0_0_1px_var(--accent-border-strong)]";

  if (multiline) {
    return (
      <textarea
        ref={ref}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        className={cx(base, "block leading-6", className)}
      />
    );
  }

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className={cx(base, "block", className)}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/mark/_components/editable-field.tsx
git commit -m "feat(mark): inline EditableField primitive for the work canvas"
```

---

## Task 6: UI — `channel-preview.tsx` frames

**Files:**
- Create: `src/app/mark/_components/channel-preview.tsx`

- [ ] **Step 1: Implement the frames**

Presentational frames switched on `kind`. Each binds `ResolvedDraftFields` to `EditableField`s via an `onField` callback. Channels are *evoked* (sender row, footer bar, phone silhouette) with no brand colors/logos. Obsidian & Gold; gold only as the active accent.

```tsx
"use client";

import type { ChannelPreviewKind, ResolvedDraftFields } from "@/domain";

import { EditableField } from "./editable-field";

type FieldKey = keyof ResolvedDraftFields;

type ChannelPreviewProps = {
  kind: ChannelPreviewKind;
  fields: ResolvedDraftFields;
  onField: (key: FieldKey, value: string) => void;
};

export function ChannelPreview({ kind, fields, onField }: ChannelPreviewProps) {
  if (kind === "email") return <EmailFrame fields={fields} onField={onField} />;
  if (kind === "ad") return <MetaAdFrame fields={fields} onField={onField} />;
  if (kind === "sms") return <SmsFrame fields={fields} onField={onField} />;
  return <GenericFrame fields={fields} onField={onField} />;
}

function EmailFrame({ fields, onField }: Omit<ChannelPreviewProps, "kind">) {
  return (
    <div className="overflow-hidden rounded-xl bg-[var(--surface-soft)] shadow-[inset_0_0_0_1px_var(--border-hairline)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent-strong)]">
          BS
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">Big Shoulders</p>
          <p className="text-[11px] text-[var(--text-muted)]">to me</p>
        </div>
      </div>
      <div className="px-4 py-3">
        <EditableField
          value={fields.subject ?? ""}
          onChange={(v) => onField("subject", v)}
          multiline={false}
          placeholder="Subject line"
          maxLength={160}
          ariaLabel="Email subject"
          className="text-[15px] font-medium tracking-[-0.01em] text-[var(--text-primary)]"
        />
        <div className="mt-3">
          <EditableField
            value={fields.body}
            onChange={(v) => onField("body", v)}
            multiline
            placeholder="Write the email…"
            ariaLabel="Email body"
            className="whitespace-pre-wrap text-[13px] text-[var(--text-secondary)]"
          />
        </div>
      </div>
    </div>
  );
}

function MetaAdFrame({ fields, onField }: Omit<ChannelPreviewProps, "kind">) {
  return (
    <div className="overflow-hidden rounded-xl bg-[var(--surface-soft)] shadow-[inset_0_0_0_1px_var(--border-hairline)]">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="h-7 w-7 rounded-full bg-[var(--accent-soft)]" />
        <div>
          <p className="text-[12px] font-semibold text-[var(--text-primary)]">Big Shoulders</p>
          <p className="text-[10px] text-[var(--text-muted)]">Sponsored</p>
        </div>
      </div>
      <div className="px-3 pb-2.5">
        <EditableField
          value={fields.primaryText ?? ""}
          onChange={(v) => onField("primaryText", v)}
          multiline
          placeholder="Primary text…"
          ariaLabel="Ad primary text"
          className="whitespace-pre-wrap text-[13px] text-[var(--text-secondary)]"
        />
      </div>
      <div className="aspect-[1.91/1] w-full bg-[var(--media-void,#0f0f12)] shadow-[inset_0_0_0_1px_var(--border-hairline)]" />
      <div className="flex items-center gap-3 bg-[var(--surface-panel)] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <EditableField
            value={fields.headline ?? ""}
            onChange={(v) => onField("headline", v)}
            multiline={false}
            placeholder="Headline"
            maxLength={80}
            ariaLabel="Ad headline"
            className="text-[13px] font-semibold text-[var(--text-primary)]"
          />
        </div>
        <span className="shrink-0 rounded-md bg-[var(--surface-raised)] px-2 py-1 shadow-[inset_0_0_0_1px_var(--border-strong)]">
          <EditableField
            value={fields.cta ?? ""}
            onChange={(v) => onField("cta", v)}
            multiline={false}
            placeholder="Learn More"
            maxLength={24}
            ariaLabel="Ad button label"
            className="text-center text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]"
          />
        </span>
      </div>
    </div>
  );
}

function SmsFrame({ fields, onField }: Omit<ChannelPreviewProps, "kind">) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[26px] bg-[var(--canvas-deep)] p-3 shadow-[inset_0_0_0_1px_var(--border-hairline)]">
      <p className="mb-2 text-center text-[11px] font-medium text-[var(--text-muted)]">Big Shoulders</p>
      <div className="rounded-[18px] rounded-bl-[6px] bg-[var(--surface-raised)] px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--border-hairline)]">
        <EditableField
          value={fields.body}
          onChange={(v) => onField("body", v)}
          multiline
          placeholder="Write the text…"
          maxLength={480}
          ariaLabel="SMS message"
          className="whitespace-pre-wrap text-[13px] text-[var(--text-primary)]"
        />
      </div>
    </div>
  );
}

function GenericFrame({ fields, onField }: Omit<ChannelPreviewProps, "kind">) {
  return (
    <div className="rounded-xl bg-[var(--surface-soft)] p-4 shadow-[inset_0_0_0_1px_var(--border-hairline)]">
      <EditableField
        value={fields.title ?? ""}
        onChange={(v) => onField("title", v)}
        multiline={false}
        placeholder="Title"
        ariaLabel="Title"
        className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-[var(--text-primary)]"
      />
      <div className="mt-2.5">
        <EditableField
          value={fields.body}
          onChange={(v) => onField("body", v)}
          multiline
          placeholder="Body…"
          ariaLabel="Body"
          className="whitespace-pre-wrap text-[13px] leading-6 text-[var(--text-secondary)]"
        />
      </div>
    </div>
  );
}
```

> Note: the title in `GenericFrame` mirrors the existing `Artifact` heading sizing.

- [ ] **Step 2: Commit**

```bash
git add src/app/mark/_components/channel-preview.tsx
git commit -m "feat(mark): channel-true preview frames (email/meta/sms/generic)"
```

---

## Task 7: UI — `channel-artifact.tsx` live container

**Files:**
- Create: `src/app/mark/_components/channel-artifact.tsx`

- [ ] **Step 1: Implement the container**

Fetches the live draft via `getDraftAssetAction`, holds field state, tracks dirty, renders the frame + Save + the existing Approve/Decline forms + an "Edited" pill.

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import type { MarkActionApproval } from "@/domain";

import { decideCampaignDraftAction, editDraftAssetAction, getDraftAssetAction } from "../actions";
import type { DraftAssetView } from "../actions";
import { ChannelPreview } from "./channel-preview";

const STRUCTURED_KEYS = ["subject", "primaryText", "headline", "cta"] as const;

function EditedPill() {
  return (
    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
      Edited
    </span>
  );
}

function LockNote() {
  return (
    <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
      <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="9" width="10" height="7" rx="1.5" />
        <path d="M7 9V7a3 3 0 0 1 6 0v2" />
      </svg>
      outbound locked
    </span>
  );
}

export function ChannelArtifact({ approval }: { approval: MarkActionApproval }) {
  const [view, setView] = useState<DraftAssetView | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  async function load() {
    setLoading(true);
    const next = await getDraftAssetAction(approval.assetId);
    if (next) {
      setView(next);
      setFields({
        title: next.fields.title ?? "",
        subject: next.fields.subject ?? "",
        primaryText: next.fields.primaryText ?? "",
        headline: next.fields.headline ?? "",
        cta: next.fields.cta ?? "",
        body: next.fields.body ?? "",
      });
      setDirty(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approval.assetId]);

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  function save() {
    if (!view) return;
    const structured: Record<string, string> = {};
    for (const k of STRUCTURED_KEYS) {
      if (fields[k]?.trim()) structured[k] = fields[k];
    }
    startSave(async () => {
      const res = await editDraftAssetAction({
        assetId: view.assetId,
        campaignId: view.campaignId,
        title: fields.title,
        body: fields.body,
        fields: structured,
      });
      if (res.ok) {
        setError(null);
        setSaved(true);
        await load();
      } else {
        setError(res.message);
      }
    });
  }

  if (loading && !view) {
    return (
      <div className="flex flex-col gap-2">
        <div className="mark-skel" style={{ width: "60%" }} />
        <div className="mark-skel" style={{ width: "100%" }} />
        <div className="mark-skel" style={{ width: "88%" }} />
      </div>
    );
  }

  if (!view) {
    return <p className="text-xs leading-5 text-[var(--text-muted)]">This draft isn’t available to edit right now.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
          Draft
        </span>
        {view.edited ? <EditedPill /> : null}
        <span className="ml-auto" />
        <LockNote />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ChannelPreview kind={view.kind} fields={{ ...view.fields, ...fields }} onField={(k, v) => setField(k as string, v)} />
        {error ? <p className="mt-2 text-[11px] text-[var(--priority-bright)]">{error}</p> : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="w-full rounded-lg bg-[var(--accent)] py-2 text-xs font-bold text-[var(--on-accent)] transition enabled:hover:bg-[var(--accent-strong)] disabled:opacity-45"
        >
          {saving ? "Saving…" : saved && !dirty ? "Saved" : "Save edits"}
        </button>

        <div className="flex items-center gap-2">
          <form action={decideCampaignDraftAction} className="flex-1">
            <input type="hidden" name="assetId" value={view.assetId} />
            <input type="hidden" name="campaignId" value={view.campaignId} />
            <input type="hidden" name="decision" value="approved" />
            <button
              type="submit"
              className="w-full rounded-lg border border-[var(--ok-border)] bg-[var(--ok-solid)] py-2 text-xs font-bold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)]"
            >
              Approve
            </button>
          </form>
          <form action={decideCampaignDraftAction}>
            <input type="hidden" name="assetId" value={view.assetId} />
            <input type="hidden" name="campaignId" value={view.campaignId} />
            <input type="hidden" name="decision" value="declined" />
            <button
              type="submit"
              className="rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--priority-bright)]"
            >
              Decline
            </button>
          </form>
        </div>
        <Link
          href={`/campaigns/${view.campaignId}`}
          className="rounded-lg py-2 text-center text-xs font-semibold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]"
        >
          Request a revision · open full draft
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/mark/_components/channel-artifact.tsx
git commit -m "feat(mark): live ChannelArtifact container (fetch, edit, save, approve)"
```

---

## Task 8: Wire `ChannelArtifact` into `work-canvas.tsx`

**Files:**
- Modify: `src/app/mark/_components/work-canvas.tsx`

- [ ] **Step 1: Import the container**

Add near the top imports of `work-canvas.tsx`:

```tsx
import { ChannelArtifact } from "./channel-artifact";
```

- [ ] **Step 2: Route draft cards with a backing asset to the live container**

In the `WorkCanvas` return, the current branch renders `<Artifact card={draft} />` when `draft` is set. Replace that single branch so a draft *with an approval* (backing asset) goes to the live editor, and a draft *without* one keeps the read-only `Artifact`:

Find:
```tsx
      ) : draft ? (
        <Artifact card={draft} />
      ) : (
```

Replace with:
```tsx
      ) : draft && draft.approval ? (
        <ChannelArtifact approval={draft.approval} />
      ) : draft ? (
        <Artifact card={draft} />
      ) : (
```

- [ ] **Step 3: Manual sanity (deferred to Task 9 for full verify)**

The `Artifact` component and its `LockNote` remain in the file for the no-approval branch. No other changes.

- [ ] **Step 4: Commit**

```bash
git add src/app/mark/_components/work-canvas.tsx
git commit -m "feat(mark): route editable draft cards to the live channel artifact"
```

---

## Task 9: Verify — lint, build, test, preview

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS, including the new `mark-canvas.test.ts`.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: compiles with no type errors.

- [ ] **Step 4: Manual preview**

Run: `pnpm dev`, open `/mark`, open a thread where Mark produced a draft card with an `approval` (e.g. via `pnpm seed:test-campaign`). Confirm: the canvas shows the correct frame for the asset's channel, fields are editable, Save persists (an "Edited" pill appears after reload), Approve still works, and outbound stays locked. For a `result` card or a draft with no approval, the generic read-only `Artifact` still renders.

- [ ] **Step 5: Final commit (if any preview fixes were needed)**

```bash
git add -p   # stage only the files this plan touched
git commit -m "fix(mark): work canvas v2 preview adjustments"
```

> Reminder: never `git add -A`. Do not stage `campaign-library.tsx` or `campaigns/page.tsx` (another session's WIP).

---

## Self-Review

**Spec coverage:**
- Migration (`edited_fields` + `asset_edited` enum value) → Task 1. ✓
- Domain `channelPreviewKind` / `editableFieldSpec` / `resolveDraftFields` / `isDraftEdited` → Task 2. ✓
- Lib `getDraftAsset` / `editDraftAsset` (+ event log, no dispatch unlock) → Task 3. ✓
- Actions `getDraftAssetAction` / `editDraftAssetAction` (operator-gated, revalidate) → Task 4. ✓
- UI `editable-field.tsx` → Task 5; `channel-preview.tsx` (4 frames) → Task 6; `channel-artifact.tsx` (live fetch + Save + Edited pill + Approve) → Task 7; wire-in → Task 8. ✓
- Verification (lint/build/test/preview) → Task 9. ✓

**Type consistency:** `DraftAssetView`, `ResolvedDraftFields`, `ChannelPreviewKind`, `EditableFieldSpec`, `MarkActionApproval` are defined/imported consistently across tasks. `editDraftAssetAction` input shape matches `EditDraftAssetInput` (minus the operator, supplied server-side). `ChannelPreview` `onField` key type matches `keyof ResolvedDraftFields`; `ChannelArtifact` passes string keys (widened) which is compatible.

**Placeholder scan:** No TBD/TODO; every code step shows full code. The one soft spot (`serif === serif` guard) is explicitly addressed in Task 9 Step 2.

**Note on `edited` pill staleness:** `view.edited` reflects the last fetch; after a Save, `load()` re-fetches so the pill updates. Pre-save dirty state is conveyed by the Save button label, not the pill — intentional.
