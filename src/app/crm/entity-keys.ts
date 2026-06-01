/**
 * CRM "entity" objects that support direct create/edit (companies, contacts,
 * properties). Kept out of actions.ts because a "use server" module may only
 * export async functions. Leads/jobs/outcomes are intentionally excluded — they
 * flow through scored intake and operations, not generic CRM forms.
 */
export const CRM_ENTITY_KEYS = ["companies", "contacts", "properties"] as const;
export type CrmEntityKey = (typeof CRM_ENTITY_KEYS)[number];

export function isCrmEntityKey(value: string): value is CrmEntityKey {
  return (CRM_ENTITY_KEYS as readonly string[]).includes(value);
}
