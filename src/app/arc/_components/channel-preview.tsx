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
          YB
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">Your brand</p>
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
          <p className="text-[12px] font-semibold text-[var(--text-primary)]">Your brand</p>
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
      <p className="mb-2 text-center text-[11px] font-medium text-[var(--text-muted)]">Your brand</p>
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
