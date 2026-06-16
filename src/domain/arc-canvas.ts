/**
 * Pure logic for the Live Work Canvas. No I/O. Classifies an asset's channel into
 * a preview frame, declares which fields each frame exposes for inline editing, and
 * resolves the editable field values from a persisted draft (operator edits win over
 * Arc's original prompt_inputs / draft_body).
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
  const hay = `${channel ?? ""} ${assetType ?? ""}`.toLowerCase().replace(/[_-]+/g, " ");
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
    // title edits persist to the `title` column (not edited_fields), so the DB
    // column outranks prompt_inputs here — otherwise a saved edit would be masked
    // by Arc's original prompt input on reload.
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
