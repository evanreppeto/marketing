/**
 * Pure mapping of external-CRM records (HubSpot first) onto the app's lead-
 * ingestion contract (BSR-368). No I/O — the live OAuth pull + the persisted,
 * idempotent upsert live in the connector runtime; this module only translates a
 * fetched HubSpot object into a `LeadIngestionInput` that `parseLeadIngestionPayload`
 * accepts (persona-mapped, `externalLeadId` set for idempotent upsert). Kept pure
 * so it's unit-testable against fixtures with no network.
 *
 * Persona note: the ingest contract requires an OFFICIAL persona and rejects
 * `unassigned_persona`. There is no persona classifier for arbitrary CRM data
 * (and personas are tenant-specific), so imported contacts take the connector's
 * configured `defaultPersona`, optionally overridden per-record by a mapped
 * HubSpot property whose value is itself a valid official persona key.
 */

import { type LeadIngestionInput } from "./lead-ingestion";
import { isAllowedPersona, isOfficialPersonaMapping } from "./personas";

export type HubspotContact = {
  /** HubSpot object id — the external id we key the idempotent upsert on. */
  id: string;
  properties?: Record<string, unknown> | null;
  updatedAt?: string;
};

export type HubspotImportOptions = {
  /** Persona assigned to imported contacts (operator-configured per connector). A
   *  key from the workspace's own taxonomy — validated by the caller. */
  defaultPersona: string;
  /** Optional HubSpot property whose value (when a persona the workspace allows)
   *  overrides the default. */
  personaProperty?: string;
  /** The workspace's allowed persona keys. When set, a mapped override is accepted
   *  if it's one of these; when omitted, the official set is used (back-compat). */
  allowedPersonaKeys?: readonly string[];
  /** Value written to the lead's `source`. */
  source?: string;
};

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Resolve the persona for an imported contact: a mapped property value (when it's
 * a persona the workspace allows) wins, else the configured default. The override
 * is checked against the workspace's own taxonomy (`allowedPersonaKeys`) so a
 * non-restoration org's persona in the mapped column is honored, not silently
 * dropped; absent that list it falls back to the official set (back-compat).
 */
export function resolveHubspotPersona(contact: HubspotContact, opts: HubspotImportOptions): string {
  if (opts.personaProperty) {
    const raw = contact.properties?.[opts.personaProperty];
    const allowed = opts.allowedPersonaKeys
      ? isAllowedPersona(raw, opts.allowedPersonaKeys)
      : isOfficialPersonaMapping(raw);
    if (allowed) return raw as string;
  }
  return opts.defaultPersona;
}

/**
 * Map a HubSpot contact into the app's lead-ingestion input. Returns null when
 * the contact carries no usable name/email/phone (the contact block needs one),
 * so a junk record is skipped rather than rejected downstream. `externalLeadId`
 * is the HubSpot id, giving the eventual persist path an idempotent upsert key.
 */
export function mapHubspotContactToLead(contact: HubspotContact, opts: HubspotImportOptions): LeadIngestionInput | null {
  const p = contact.properties ?? {};
  const firstName = str(p.firstname);
  const lastName = str(p.lastname);
  const email = str(p.email);
  const phone = str(p.phone);
  if (!firstName && !lastName && !email && !phone) return null;

  const companyName = str(p.company);
  const contactBlock = {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  };
  const location = {
    ...(str(p.city) ? { city: str(p.city) } : {}),
    ...(str(p.state) ? { state: str(p.state) } : {}),
    ...(str(p.zip) ? { postalCode: str(p.zip) } : {}),
  };

  return {
    persona: resolveHubspotPersona(contact, opts),
    source: opts.source ?? "hubspot",
    externalLeadId: contact.id,
    ...(companyName ? { company: { name: companyName } } : {}),
    contact: contactBlock,
    ...(Object.keys(location).length ? { location } : {}),
  };
}

/** Map a page of HubSpot contacts, dropping unusable rows. */
export function mapHubspotContacts(contacts: HubspotContact[], opts: HubspotImportOptions): LeadIngestionInput[] {
  const out: LeadIngestionInput[] = [];
  for (const contact of contacts) {
    if (!contact?.id) continue;
    const lead = mapHubspotContactToLead(contact, opts);
    if (lead) out.push(lead);
  }
  return out;
}
