import { type HubspotContact } from "@/domain";

// The injectable seam for CRM import (BSR-368). An import pulls contacts through a
// `CrmImportSource`, one page at a time, following an opaque cursor. Everything
// downstream (map → validate → idempotent persist) is provider-agnostic; only the
// source knows how to talk to HubSpot / Salesforce / a fixture. This mirrors how
// the weather connector hides the live NWS feed behind an injectable
// `WeatherEventSource`, so the orchestrator + tests never touch the network.

export type CrmContactPage = {
  /** HubSpot-shaped contacts for this page (the mapper's input shape). */
  contacts: HubspotContact[];
  /** Opaque token for the next page; undefined/null when this is the last page. */
  nextCursor?: string | null;
};

export type CrmImportSource = {
  /** Fetch one page of contacts. `cursor` is the token returned by the prior page. */
  listContacts(cursor?: string): Promise<CrmContactPage>;
};

/**
 * A deterministic in-memory source over a list of pages, for tests and the
 * offline/preview path. The cursor is the next page index; an out-of-range cursor
 * yields an empty final page. Mirrors `configReviewSource` (the un-onboarded
 * connector proposes nothing rather than inventing data).
 */
export function fixtureCrmImportSource(pages: CrmContactPage[]): CrmImportSource {
  return {
    async listContacts(cursor?: string): Promise<CrmContactPage> {
      const index = cursor ? Number.parseInt(cursor, 10) : 0;
      const page = Number.isFinite(index) ? pages[index] : undefined;
      if (!page) return { contacts: [] };
      const hasNext = index + 1 < pages.length;
      return { contacts: page.contacts, nextCursor: hasNext ? String(index + 1) : null };
    },
  };
}

/** Convenience: build a fixture source by chunking a flat contact list. */
export function fixtureCrmImportSourceFromContacts(contacts: HubspotContact[], pageSize = 100): CrmImportSource {
  const size = Math.max(1, pageSize);
  const pages: CrmContactPage[] = [];
  for (let i = 0; i < contacts.length; i += size) {
    pages.push({ contacts: contacts.slice(i, i + size) });
  }
  return fixtureCrmImportSource(pages.length ? pages : [{ contacts: [] }]);
}
