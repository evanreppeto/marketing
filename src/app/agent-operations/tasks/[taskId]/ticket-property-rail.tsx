"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { StatusPill } from "@/app/_components/page-header";

import { updateTaskFieldAction } from "./actions";
import type { EditableField } from "./actions";

type TicketPropertyRailProps = {
  taskId: string;
  status: string;
  priority: string;
  ownerLabel: string;
  driverKind: string;
  driverLabel: string;
  approverLabel: string;
  dueAt: string | null;
  scheduledFor?: string | null;
  campaign: { id: string; name: string; status: string } | null;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type FieldState = Record<string, "saving" | "saved" | "failed" | undefined>;

const STATUS_OPTIONS = ["queued", "running", "blocked", "needs_approval", "completed", "failed", "canceled"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];
const DRIVER_KIND_OPTIONS = ["human", "agent", "system"];

export function TicketPropertyRail({
  taskId,
  status,
  priority,
  ownerLabel,
  driverKind,
  driverLabel,
  approverLabel,
  dueAt,
  scheduledFor,
  campaign,
  sourceType,
  sourceId,
  createdAt,
  updatedAt,
}: TicketPropertyRailProps) {
  const [values, setValues] = useState({
    status,
    priority,
    owner_label: ownerLabel,
    driver_kind: driverKind,
    driver_label: driverLabel,
    approver_label: approverLabel,
    due_at: toDateTimeLocalValue(dueAt),
  });
  const [fieldStates, setFieldStates] = useState<FieldState>({});
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const source = relatedRecordHref(sourceType, sourceId);

  function updateValue(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function saveField(field: EditableField, value: string | null) {
    setError(null);
    setFieldStates((current) => ({ ...current, [field]: "saving" }));
    startTransition(async () => {
      const result = await updateTaskFieldAction(taskId, { field, value });
      setFieldStates((current) => ({ ...current, [field]: result.ok ? "saved" : "failed" }));
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
      <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-3 shadow-[var(--elev-panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-3">
          <div>
            <div className="signal-eyebrow">Properties</div>
            <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Shared ticket control</div>
          </div>
          <StatusPill tone="amber">Locked</StatusPill>
        </div>

        <div className="mt-3 space-y-3">
          <RailSelect
            label="Status"
            onChange={(value) => {
              updateValue("status", value);
              saveField("status", value);
            }}
            options={STATUS_OPTIONS}
            state={fieldStates.status}
            value={values.status}
          />
          <RailSelect
            label="Priority"
            onChange={(value) => {
              updateValue("priority", value);
              saveField("priority", value);
            }}
            options={PRIORITY_OPTIONS}
            state={fieldStates.priority}
            value={values.priority}
          />
          <RailInput
            label="Owner"
            onBlur={(value) => saveField("owner_label", value)}
            onChange={(value) => updateValue("owner_label", value)}
            state={fieldStates.owner_label}
            value={values.owner_label}
          />
          <RailSelect
            label="Driver kind"
            onChange={(value) => {
              updateValue("driver_kind", value);
              saveField("driver_kind", value);
            }}
            options={DRIVER_KIND_OPTIONS}
            state={fieldStates.driver_kind}
            value={values.driver_kind}
          />
          <RailInput
            label="Driver"
            onBlur={(value) => saveField("driver_label", value)}
            onChange={(value) => updateValue("driver_label", value)}
            state={fieldStates.driver_label}
            value={values.driver_label}
          />
          <RailInput
            label="Approver"
            onBlur={(value) => saveField("approver_label", value)}
            onChange={(value) => updateValue("approver_label", value)}
            state={fieldStates.approver_label}
            value={values.approver_label}
          />
          <RailDateInput
            label="Due"
            onChange={(value) => {
              updateValue("due_at", value);
              saveField("due_at", fromDateTimeLocalValue(value));
            }}
            state={fieldStates.due_at}
            value={values.due_at}
          />
        </div>

        {error ? <p className="mt-3 text-xs font-semibold text-[var(--warn)]">{error}</p> : null}
      </section>

      <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-3 shadow-[var(--elev-panel)]">
        <div className="signal-eyebrow">Growth context</div>
        <dl className="mt-3 space-y-3">
          <ContextRow label="Campaign">
            {campaign ? (
              <Link className="truncate font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={`/campaigns/${campaign.id}`}>
                {campaign.name}
              </Link>
            ) : (
              <span className="text-[var(--text-muted)]">No campaign</span>
            )}
          </ContextRow>
          <ContextRow label="Source">
            {source ? (
              <Link className="font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={source.href}>
                {source.label}
              </Link>
            ) : (
              <span className="text-[var(--text-muted)]">Not linked</span>
            )}
          </ContextRow>
          <ContextRow label="Outbound">
            <StatusPill tone="amber">Locked</StatusPill>
          </ContextRow>
          {scheduledFor ? <ContextRow label="Scheduled">{formatDate(scheduledFor)}</ContextRow> : null}
          <ContextRow label="Created">{formatDate(createdAt)}</ContextRow>
          <ContextRow label="Updated">{formatDate(updatedAt)}</ContextRow>
        </dl>
      </section>
    </aside>
  );
}

function RailSelect({
  label,
  value,
  options,
  state,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  state: FieldState[string];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <RailLabel label={label} state={state} />
      <select
        className="mt-1 min-h-10 w-full cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {humanize(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function RailInput({
  label,
  value,
  state,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  state: FieldState[string];
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}) {
  return (
    <label className="block">
      <RailLabel label={label} state={state} />
      <input
        className="mt-1 min-h-10 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        onBlur={(event) => onBlur(event.target.value.trim())}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        value={value}
      />
    </label>
  );
}

function RailDateInput({
  label,
  value,
  state,
  onChange,
}: {
  label: string;
  value: string;
  state: FieldState[string];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <RailLabel label={label} state={state} />
      <input
        className="mt-1 min-h-10 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        onChange={(event) => onChange(event.target.value)}
        type="datetime-local"
        value={value}
      />
    </label>
  );
}

function RailLabel({ label, state }: { label: string; state: FieldState[string] }) {
  return (
    <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
      {label}
      {state ? <span className={state === "failed" ? "normal-case tracking-normal text-[var(--warn)]" : "normal-case tracking-normal"}>{stateText(state)}</span> : null}
    </span>
  );
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-[var(--text-secondary)]">{children}</dd>
    </div>
  );
}

function stateText(state: NonNullable<FieldState[string]>) {
  if (state === "saving") return "Saving";
  if (state === "saved") return "Saved";
  return "Failed";
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function relatedRecordHref(sourceType: string | null, sourceId: string | null) {
  if (!sourceType || !sourceId) return null;
  if (sourceType === "company" || sourceType === "companies") return { href: `/crm/companies/${sourceId}`, label: "Company" };
  if (sourceType === "contact" || sourceType === "contacts") return { href: `/crm/contacts/${sourceId}`, label: "Contact" };
  if (sourceType === "lead" || sourceType === "leads") return { href: `/crm/leads/${sourceId}`, label: "Lead" };
  if (sourceType === "property" || sourceType === "properties") return { href: `/crm/properties/${sourceId}`, label: "Property" };
  if (sourceType === "job" || sourceType === "jobs") return { href: `/crm/jobs/${sourceId}`, label: "Job" };
  if (sourceType === "outcome" || sourceType === "outcomes") return { href: `/crm/outcomes/${sourceId}`, label: "Outcome" };
  return null;
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
