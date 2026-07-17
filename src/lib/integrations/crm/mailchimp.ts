import type { HubspotContact } from "@/domain";

import type { CrmContactPage, CrmImportSource } from "./source";

/**
 * A read-only CrmImportSource backed by the Mailchimp Marketing API. A workspace's
 * audience members become the engine's generic contact shape, so a Mailchimp import
 * flows through the exact map → validate → dedup → persist pipeline as HubSpot / CSV.
 * Read-IN only; nothing is written back to Mailchimp and nothing goes outbound.
 */

const PAGE_SIZE = 500;
const MEMBER_FIELDS = "members.id,members.email_address,members.merge_fields,members.status,total_items";

/** A Mailchimp API key is `<key>-<datacenter>` (e.g. "…-us21"); the datacenter is the
 *  API host. Returns null for a key with no datacenter suffix (invalid). */
export function mailchimpDataCenter(apiKey: string): string | null {
  const dc = apiKey.trim().split("-").pop();
  return dc && dc !== apiKey.trim() && /^[a-z]+\d+$/i.test(dc) ? dc : null;
}

type MailchimpMember = {
  id?: string;
  email_address?: string;
  status?: string;
  merge_fields?: Record<string, unknown> | null;
};
type MailchimpMembersResponse = { members?: MailchimpMember[]; total_items?: number };

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Map a Mailchimp member to the engine's contact shape. Merge fields vary per
 * audience but FNAME/LNAME/PHONE/COMPANY/ADDRESS are the Mailchimp defaults. The id
 * is namespaced `mailchimp:` so it can't collide with a HubSpot or CSV external id.
 */
export function mailchimpMemberToContact(member: MailchimpMember): HubspotContact | null {
  const email = str(member.email_address);
  const mf = member.merge_fields ?? {};
  const firstName = str(mf.FNAME);
  const lastName = str(mf.LNAME);
  const phone = str(mf.PHONE);
  if (!email && !firstName && !lastName && !phone) return null;

  const address = (mf.ADDRESS && typeof mf.ADDRESS === "object" ? (mf.ADDRESS as Record<string, unknown>) : {}) ?? {};
  const properties: Record<string, unknown> = {};
  if (firstName) properties.firstname = firstName;
  if (lastName) properties.lastname = lastName;
  if (email) properties.email = email;
  if (phone) properties.phone = phone;
  if (str(mf.COMPANY)) properties.company = str(mf.COMPANY);
  if (str(address.city)) properties.city = str(address.city);
  if (str(address.state)) properties.state = str(address.state);
  if (str(address.zip)) properties.zip = str(address.zip);

  // member.id is Mailchimp's stable member hash (MD5 of the lowercased email);
  // fall back to the email so a member missing an id still dedups sanely.
  const externalId = str(member.id) ?? (email ? `email:${email.toLowerCase()}` : null);
  if (!externalId) return null;
  return { id: `mailchimp:${externalId}`, properties };
}

export type MailchimpSourceOptions = {
  fetchImpl?: typeof fetch;
  /** Restrict to subscribed members (the default) or import all statuses. */
  status?: string;
};

/**
 * Build a read-only import source over a Mailchimp audience. Pages with offset;
 * a non-2xx throws with the status so the engine records the failure rather than
 * importing a partial batch (mirrors the HubSpot source).
 */
export function mailchimpImportSource(apiKey: string, audienceId: string, opts: MailchimpSourceOptions = {}): CrmImportSource {
  const dc = mailchimpDataCenter(apiKey);
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async listContacts(cursor?: string): Promise<CrmContactPage> {
      if (!dc) throw new Error("Invalid Mailchimp API key — expected the '<key>-<datacenter>' form.");
      const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
      const url = new URL(`https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(audienceId)}/members`);
      url.searchParams.set("count", String(PAGE_SIZE));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("fields", MEMBER_FIELDS);
      if (opts.status) url.searchParams.set("status", opts.status);

      const res = await doFetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Mailchimp members fetch failed (${res.status})`);
      const body = (await res.json()) as MailchimpMembersResponse;
      const members = body.members ?? [];
      const contacts = members
        .map(mailchimpMemberToContact)
        .filter((c): c is HubspotContact => c !== null);

      const nextOffset = offset + members.length;
      const hasMore = members.length === PAGE_SIZE && (body.total_items == null || nextOffset < body.total_items);
      return { contacts, nextCursor: hasMore ? String(nextOffset) : null };
    },
  };
}

export type MailchimpConnectionResult = { ok: boolean; count?: number; error?: string };

/** Connectivity + member-count probe, powering Settings → Test connection. Never throws. */
export async function checkMailchimpConnection(apiKey: string, audienceId: string, opts: MailchimpSourceOptions = {}): Promise<MailchimpConnectionResult> {
  const dc = mailchimpDataCenter(apiKey);
  if (!dc) return { ok: false, error: "Invalid API key — expected the '<key>-<datacenter>' form (e.g. …-us21)." };
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const url = new URL(`https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(audienceId)}/members`);
    url.searchParams.set("count", "0");
    url.searchParams.set("fields", "total_items");
    const res = await doFetch(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `Mailchimp returned ${res.status} — check the key and audience id.` };
    const body = (await res.json()) as MailchimpMembersResponse;
    return { ok: true, count: body.total_items ?? 0 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not reach Mailchimp." };
  }
}
