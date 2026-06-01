import { OFFICIAL_PERSONA_MAPPINGS } from "@/domain";

import { Button } from "../../_components/page-header";
import { createCrmRecordAction, updateCrmRecordAction } from "../actions";
import { type CrmEntityKey } from "../entity-keys";

type FieldType = "text" | "email" | "tel" | "url" | "select";
type Field = { name: string; label: string; type?: FieldType; required?: boolean; placeholder?: string; options?: Array<{ value: string; label: string }> };

const PERSONA_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "unassigned_persona", label: "Unassigned" },
  ...OFFICIAL_PERSONA_MAPPINGS.map((persona) => ({ value: persona, label: titleize(persona.replace("persona_", "")) })),
];

const ENTITY_FIELDS: Record<CrmEntityKey, Field[]> = {
  companies: [
    { name: "name", label: "Company name", required: true, placeholder: "North Branch Insurance" },
    { name: "persona", label: "Persona", type: "select", options: PERSONA_OPTIONS },
    { name: "partner_tier", label: "Partner tier", placeholder: "A / B / C" },
    { name: "website_url", label: "Website", type: "url", placeholder: "https://" },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "email", label: "Email", type: "email" },
  ],
  contacts: [
    { name: "full_name", label: "Full name", placeholder: "Marlene Vega" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "title", label: "Title", placeholder: "Property manager" },
    { name: "persona", label: "Persona", type: "select", options: PERSONA_OPTIONS },
    { name: "company_id", label: "Company ID (optional)", placeholder: "Link to an existing company" },
  ],
  properties: [
    { name: "street_line_1", label: "Street", required: true, placeholder: "1234 W Addison St" },
    { name: "street_line_2", label: "Street line 2" },
    { name: "city", label: "City", required: true },
    { name: "state", label: "State", required: true, placeholder: "IL" },
    { name: "postal_code", label: "Postal code", required: true },
    { name: "property_type", label: "Property type", placeholder: "Single family / multi-unit" },
    { name: "persona", label: "Persona", type: "select", options: PERSONA_OPTIONS },
  ],
};

const SINGULAR: Record<CrmEntityKey, string> = { companies: "company", contacts: "contact", properties: "property" };

export function CrmRecordForm({
  objectKey,
  mode,
  recordId,
  values,
}: {
  objectKey: CrmEntityKey;
  mode: "create" | "edit";
  recordId?: string;
  values?: Record<string, unknown>;
}) {
  const fields = ENTITY_FIELDS[objectKey];
  const singular = SINGULAR[objectKey];

  return (
    <form
      action={mode === "edit" ? updateCrmRecordAction : createCrmRecordAction}
      className="signal-panel module-rise p-5 [animation-delay:40ms]"
    >
      <input type="hidden" name="objectKey" value={objectKey} />
      {mode === "edit" && recordId ? <input type="hidden" name="recordId" value={recordId} /> : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">
          {mode === "edit" ? `Edit ${singular}` : `New ${singular}`}
        </h2>
        <a className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--accent)]" href={`/crm/${objectKey}`}>
          Cancel
        </a>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label className={`block ${field.name === "street_line_1" || field.name === "name" ? "sm:col-span-2" : ""}`} key={field.name}>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {field.label}
              {field.required ? <span className="ml-1 text-[var(--priority-bright)]">*</span> : null}
            </span>
            {field.type === "select" ? (
              <select
                name={field.name}
                defaultValue={stringValue(values?.[field.name]) ?? ""}
                className="mt-2 h-11 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
              >
                {field.options?.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={field.name}
                type={field.type ?? "text"}
                required={field.required}
                placeholder={field.placeholder}
                defaultValue={stringValue(values?.[field.name]) ?? ""}
                className="mt-2 h-11 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="primary" type="submit">
          {mode === "edit" ? "Save changes" : `Create ${singular}`}
        </Button>
      </div>
    </form>
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
}

function titleize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
