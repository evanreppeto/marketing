import { type CrmEntityType } from "@/domain";

// CRM object key (plural, used in URLs) <-> entity type (singular, stored).
export const CRM_OBJECT_KEY_FOR_ENTITY: Record<CrmEntityType, string> = {
  company: "companies",
  contact: "contacts",
  property: "properties",
  lead: "leads",
  job: "jobs",
  outcome: "outcomes",
  campaign: "campaigns",
};

export function isCrmEntityType(value: string): value is CrmEntityType {
  return Object.prototype.hasOwnProperty.call(CRM_OBJECT_KEY_FOR_ENTITY, value);
}

export function recordPath(entityType: CrmEntityType, entityId: string): string {
  return `/crm/${CRM_OBJECT_KEY_FOR_ENTITY[entityType]}/${entityId}`;
}

/**
 * Build a record path from possibly-unvalidated form input. Falls back to the
 * CRM root when the entity type isn't recognized, so a malformed or tampered
 * submission never produces a "/crm/undefined/<id>" redirect.
 */
export function safeRecordPath(entityType: string, entityId: string): string {
  return isCrmEntityType(entityType) ? recordPath(entityType, entityId) : "/crm";
}
