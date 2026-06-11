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
    <section className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <InlineMeta label="Status">
          <StatusPill tone={statusTone(values.status)}>{humanize(values.status)}</StatusPill>
        </InlineMeta>
        <InlineMeta label="Owner">{values.owner_label}</InlineMeta>
        <InlineMeta label="Driver">{values.driver_label}</InlineMeta>
        <InlineMeta label="Priority">{humanize(values.priority)}</InlineMeta>
        <InlineMeta label="Due">{values.due_at ? formatDate(fromDateTimeLocalValue(values.due_at)) : "No due date"}</InlineMeta>
        {campaign ? (
          <InlineMeta label="Campaign">
            <Link className="font-medium text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={`/campaigns/${campaign.id}`}>
              {campaign.name}
            </Link>
          </InlineMeta>
        ) : null}
        {source ? (
          <InlineMeta label="Source">
            <Link className="font-medium text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={source.href}>
              {source.label}
            </Link>
          </InlineMeta>
        ) : null}
        <StatusPill tone="amber">Outbound locked</StatusPill>
      </div>

      <details className="mt-3 border-t border-[var(--border-hairline)] pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
          Edit properties
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </details>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-hairline)] pt-3 text-xs text-[var(--text-muted)]">
        {scheduledFor ? <span>Scheduled {formatDate(scheduledFor)}</span> : null}
        <span>Created {formatDate(createdAt)}</span>
        <span>Updated {formatDate(updatedAt)}</span>
        <span>Approver {values.approver_label}</span>
      </div>
    </section>
  );
}

function InlineMeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <span className="max-w-[240px] truncate font-semibold text-[var(--text-secondary)]">{children}</span>
    </span>
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

function stateText(state: NonNullable<FieldState[string]>) {
  if (state === "saving") return "Saving";
  if (state === "saved") return "Saved";
  return "Failed";
}

function statusTone(status: string): "amber" | "green" | "red" | "blue" | "gray" {
  if (["completed", "approved", "passed"].includes(status)) return "green";
  if (["running", "processing"].includes(status)) return "blue";
  if (["blocked", "failed", "error", "canceled"].includes(status)) return "red";
  if (["queued", "needs_approval", "pending"].includes(status)) return "amber";
  return "gray";
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
