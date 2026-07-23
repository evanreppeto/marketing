/**
 * Pure logic for the Resend engagement webhook: event parsing and the mapping
 * from a provider event to the engagement row + dispatch transition the app
 * records. No I/O and no runtime-specific imports — signature verification
 * (node:crypto) lives in `src/lib/dispatch/resend-webhook.ts`.
 *
 * This is the INBOUND half of the send loop. `executeResendDispatch` records
 * `outbound_send` when an email leaves; without these events nothing ever
 * records that a recipient received, opened, or clicked it — the learning loop
 * (journeys, performance, exemplar selection) starves with zero inbound fuel.
 */

/** The Resend event types the app understands (anything else is acknowledged and dropped). */
export const RESEND_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
] as const;
export type ResendEventType = (typeof RESEND_EVENT_TYPES)[number];

export type ResendWebhookEvent = {
  type: ResendEventType;
  /** Resend's message id — matches `campaign_dispatches.provider_message_id`. */
  emailId: string;
  /** Provider-side occurrence time (ISO); the write site falls back to now. */
  createdAt: string | null;
  /** First clicked link, when the event is email.clicked. */
  clickedLink: string | null;
};

/** Parse a Resend webhook body. Returns null for anything malformed or a type
 *  the app doesn't handle — the route acknowledges those without writing. */
export function parseResendWebhookEvent(value: unknown): ResendWebhookEvent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string" || !(RESEND_EVENT_TYPES as readonly string[]).includes(type)) return null;
  const data = record.data;
  if (!data || typeof data !== "object") return null;
  const dataRecord = data as Record<string, unknown>;
  const emailId = dataRecord.email_id;
  if (typeof emailId !== "string" || !emailId) return null;
  const createdAt = typeof record.created_at === "string" ? record.created_at : null;
  const click = dataRecord.click;
  const clickedLink =
    click && typeof click === "object" && typeof (click as Record<string, unknown>).link === "string"
      ? ((click as Record<string, unknown>).link as string)
      : null;
  return { type: type as ResendEventType, emailId, createdAt, clickedLink };
}

export type ResendEngagementInput = {
  /** engagement_events.event_type — journey mapping keys off open/click substrings. */
  eventType: string;
  direction: "inbound" | "outbound";
  summary: string;
};

/**
 * The engagement row a provider event becomes, or null when the event should
 * not be recorded (`email.sent` duplicates the app's own `outbound_send`;
 * `delivery_delayed` is operational noise, visible in Resend's own dashboard).
 */
export function engagementForResendEvent(event: ResendWebhookEvent): ResendEngagementInput | null {
  switch (event.type) {
    case "email.delivered":
      return { eventType: "email_delivered", direction: "outbound", summary: "Email delivered to the recipient's mailbox." };
    case "email.opened":
      return { eventType: "email_open", direction: "inbound", summary: "Recipient opened the email." };
    case "email.clicked":
      return {
        eventType: "email_click",
        direction: "inbound",
        summary: event.clickedLink ? `Recipient clicked ${event.clickedLink}` : "Recipient clicked a link in the email.",
      };
    case "email.bounced":
      return { eventType: "email_bounced", direction: "outbound", summary: "Email bounced — the address did not accept it." };
    case "email.complained":
      return { eventType: "email_complained", direction: "inbound", summary: "Recipient marked the email as spam." };
    default:
      return null;
  }
}

/**
 * The dispatch status a provider event advances the row to, or null to leave it
 * alone. Forward-only: `sent → delivered` and `sent → failed` (bounce); opens
 * and clicks never touch dispatch state.
 */
export function dispatchStatusForResendEvent(type: ResendEventType): "delivered" | "failed" | null {
  if (type === "email.delivered") return "delivered";
  if (type === "email.bounced") return "failed";
  return null;
}
