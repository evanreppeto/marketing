// Pure logic for a campaign's send audience — who, out of the CRM, a campaign
// would actually reach. Kept free of I/O so it's unit-testable; the Supabase
// query lives in `src/lib/campaigns/audience.ts`.

export type AudienceContact = {
  id: string;
  name: string;
  email: string | null;
  status: string;
};

export type CampaignAudienceSummary = {
  /** The campaign's target persona (persona_mapping value). */
  persona: string;
  /** Contacts in the workspace matching that persona. */
  matched: number;
  /** Of the matched contacts, how many have a usable email (would receive a send). */
  sendable: number;
  /** A small sample of the sendable recipients, for the approval-time preview. */
  sample: AudienceContact[];
};

// Deliberately conservative: a plausible single address. The point is to tell a
// sendable contact apart from a blank/garbage one for the preview count, not to
// fully validate deliverability.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isSendableEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

export function summarizeCampaignAudience(
  persona: string,
  contacts: AudienceContact[],
  sampleSize = 8,
): CampaignAudienceSummary {
  const sendableContacts = contacts.filter((c) => isSendableEmail(c.email));
  return {
    persona,
    matched: contacts.length,
    sendable: sendableContacts.length,
    sample: sendableContacts.slice(0, Math.max(0, sampleSize)),
  };
}
