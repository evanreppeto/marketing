import { z } from "zod";

import { TOUCH_KINDS, type TouchDirection } from "./journey";

/**
 * Public journey-collector contract (pure, total). This validates the untrusted
 * body posted to `POST /api/v1/journey/collect` by first-party landing pages.
 *
 * Security posture — the client is never trusted for anything load-bearing:
 *   • Only low-risk, pre-identification anonymous kinds are accepted (COLLECTABLE_KINDS).
 *   • A conversion / value / org_id can NEVER be set from here — conversions come
 *     from server-side outcomes, so a spoofed beacon can't fabricate revenue.
 *   • The org is resolved server-side from the campaign token, not from the body.
 *   • `path` is capped and query strings are dropped (no PII in URLs).
 */

// Anonymous, non-conversion touch kinds a browser may report. Everything a
// conversion/known-side would carry (payment, lead_created, outcome_won…) is
// intentionally excluded and rejected.
export const COLLECTABLE_KINDS = [
  TOUCH_KINDS.AdImpression,
  TOUCH_KINDS.AdClick,
  TOUCH_KINDS.SiteVisit,
  TOUCH_KINDS.EmailOpen,
  TOUCH_KINDS.EmailClick,
  "page_view",
  "form_view",
  "video_view",
] as const;

const CollectableKind = z.enum(COLLECTABLE_KINDS as unknown as [string, ...string[]]);

export const JourneyCollectSchema = z
  .object({
    // Attribution: at least one of token / campaignId is required so the server
    // can resolve the org. A bare beacon with neither is rejected (400).
    token: z.string().min(1).max(512).optional(),
    campaignId: z.string().uuid().optional(),
    assetId: z.string().uuid().optional(),
    channel: z.string().min(1).max(64).optional(),
    anonymousId: z.string().min(8).max(128).optional(),
    // An affirmative consent signal from the page's banner. It can only ever
    // GRANT — the server still enforces the workspace mode, GPC, and opt-outs,
    // so a page cannot use this to override a refusal.
    consent: z.boolean().optional(),
    kind: CollectableKind,
    occurredAt: z.string().datetime({ offset: true }).optional(),
    path: z.string().max(512).optional(),
    summary: z.string().max(280).optional(),
    externalRef: z.string().min(1).max(200).optional(),
  })
  .refine((v) => Boolean(v.token) || Boolean(v.campaignId), {
    message: "A campaign token or campaignId is required to attribute the touch.",
    path: ["token"],
  });

export type JourneyCollectInput = z.infer<typeof JourneyCollectSchema>;

// Collected kinds → the direction the domain classifier expects. An ad impression
// is outbound reach; everything else the browser reports is an inbound engagement.
const KIND_DIRECTION: Record<string, TouchDirection> = {
  [TOUCH_KINDS.AdImpression]: "outbound",
};

export type NormalizedCollect = {
  token: string | null;
  campaignId: string | null;
  assetId: string | null;
  channel: string | null;
  anonymousId: string | null;
  /** True only when the page affirmatively signalled consent. Grants only, never overrides. */
  consent: boolean;
  kind: string;
  direction: TouchDirection;
  occurredAt: string | null;
  /** Path with any query string / fragment stripped (privacy), or null. */
  path: string | null;
  summary: string | null;
  externalRef: string | null;
};

export type ParseCollectResult = { ok: true; value: NormalizedCollect } | { ok: false; errors: { path: string; message: string }[] };

function stripQuery(path: string | undefined): string | null {
  if (!path) return null;
  const cut = path.replace(/[?#].*$/, "").trim();
  return cut || null;
}

/** Pure + total: validate and normalize a collector body. Never throws. */
export function parseJourneyCollect(payload: unknown): ParseCollectResult {
  const parsed = JourneyCollectSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "(root)", message: issue.message })),
    };
  }
  const v = parsed.data;
  return {
    ok: true,
    value: {
      token: v.token ?? null,
      campaignId: v.campaignId ?? null,
      assetId: v.assetId ?? null,
      channel: v.channel ?? null,
      anonymousId: v.anonymousId ?? null,
      consent: v.consent === true,
      kind: v.kind,
      direction: KIND_DIRECTION[v.kind] ?? "inbound",
      occurredAt: v.occurredAt ?? null,
      path: stripQuery(v.path),
      summary: v.summary ?? null,
      externalRef: v.externalRef ?? null,
    },
  };
}
