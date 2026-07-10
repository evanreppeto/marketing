import { type HubspotContact } from "@/domain";

import { type CrmContactPage, type CrmImportSource } from "./source";

// ---------------------------------------------------------------------------
// The REAL HubSpot-backed CrmImportSource (BSR-368), read-only. It pages the
// HubSpot CRM v3 contacts API with the workspace's own OAuth access token (a
// `byo_key` connector — HubSpot bills the workspace, we don't meter it) and hands
// each page to the provider-agnostic orchestrator. Scaffolded behind the
// injectable `CrmImportSource` seam exactly like `nwsWeatherEventSource`: the live
// fetch is wired, but nothing here requires live credentials to run the tests —
// the orchestrator is exercised with `fixtureCrmImportSource`. No write, no send.
// ---------------------------------------------------------------------------

/** HubSpot contact properties we request + map onto the lead-ingestion contract. */
export const HUBSPOT_CONTACT_PROPERTIES = [
  "firstname",
  "lastname",
  "email",
  "phone",
  "company",
  "city",
  "state",
  "zip",
] as const;

export type HubspotSourceOptions = {
  /** Override the API base (tests / regional hosts). Defaults to api.hubapi.com. */
  baseUrl?: string;
  /** Page size (HubSpot max is 100). */
  pageSize?: number;
  /** Extra contact properties to request beyond the defaults. */
  extraProperties?: string[];
  /** Only pull contacts modified at/after this ISO time (incremental sync). */
  updatedAfter?: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

type HubspotContactsResponse = {
  results?: Array<{ id?: string; properties?: Record<string, unknown> | null; updatedAt?: string }>;
  paging?: { next?: { after?: string } | null } | null;
};

function propertyList(opts?: HubspotSourceOptions): string {
  const props = new Set<string>([...HUBSPOT_CONTACT_PROPERTIES, ...(opts?.extraProperties ?? [])]);
  return [...props].join(",");
}

/**
 * A read-only CrmImportSource backed by the live HubSpot contacts API. `token` is
 * the workspace's decrypted OAuth access token. Best-effort per page — a non-2xx
 * response throws with the status so the orchestrator can record the failure and
 * stop, rather than silently importing a partial/empty batch.
 */
export function hubspotCrmImportSource(token: string, opts?: HubspotSourceOptions): CrmImportSource {
  const base = (opts?.baseUrl ?? "https://api.hubapi.com").replace(/\/$/, "");
  const limit = Math.min(100, Math.max(1, opts?.pageSize ?? 100));
  const doFetch = opts?.fetchImpl ?? fetch;

  return {
    async listContacts(cursor?: string): Promise<CrmContactPage> {
      const url = new URL(`${base}/crm/v3/objects/contacts`);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("properties", propertyList(opts));
      if (cursor) url.searchParams.set("after", cursor);

      const res = await doFetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HubSpot contacts fetch failed (${res.status})`);
      }
      const body = (await res.json()) as HubspotContactsResponse;
      const contacts: HubspotContact[] = (body.results ?? [])
        .filter((r): r is { id: string; properties?: Record<string, unknown> | null; updatedAt?: string } => Boolean(r?.id))
        .map((r) => ({ id: r.id, properties: r.properties ?? {}, updatedAt: r.updatedAt }));
      return { contacts, nextCursor: body.paging?.next?.after ?? null };
    },
  };
}

export type HubspotConnectionResult = {
  ok: boolean;
  /** Total contacts in the portal (best-effort, from the search endpoint). */
  count?: number;
  error?: string;
};

/**
 * Connectivity + record-count probe for the HubSpot connector, powering Settings →
 * Test connection. Uses the search endpoint (which returns a `total`) with a
 * minimal page so it both validates the token and reports how many contacts an
 * import would see. Never throws — a failure is reported as { ok: false }.
 */
export async function checkHubspotConnection(token: string, opts?: HubspotSourceOptions): Promise<HubspotConnectionResult> {
  const base = (opts?.baseUrl ?? "https://api.hubapi.com").replace(/\/$/, "");
  const doFetch = opts?.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${base}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ limit: 1, properties: ["email"] }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: `token rejected (${res.status})` };
    if (!res.ok) return { ok: false, error: `unexpected status ${res.status}` };
    const body = (await res.json()) as { total?: number };
    return { ok: true, ...(typeof body.total === "number" ? { count: body.total } : {}) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "HubSpot unreachable" };
  }
}
