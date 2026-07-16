/**
 * Journey consent — the single pure authority for "may we record this touch?".
 *
 * Journey tracking observes real people, so the answer is decided in one place
 * and enforced SERVER-SIDE at the collector (a client can lie about consent; the
 * server owns the workspace's mode, the Sec-GPC header, and the suppression list).
 * The browser snippet applies the same rules early as a courtesy — so an opted-out
 * or GPC visitor never even sends a beacon — but it is not the gate.
 *
 * Precedence is privacy-first and deliberate:
 *   off → opted_out → GPC → explicit-consent-required → allowed
 *
 * Notably GPC wins over a banner "accept": Global Privacy Control is a standing
 * legal opt-out signal, and honoring it over a click is the defensible reading.
 */

export const JOURNEY_CONSENT_MODES = ["implied", "explicit", "off"] as const;
export type JourneyConsentMode = (typeof JOURNEY_CONSENT_MODES)[number];

export const JOURNEY_CONSENT_MODE_META: { key: JourneyConsentMode; label: string; blurb: string }[] = [
  {
    key: "implied",
    label: "Implied",
    blurb: "Record campaign click-throughs by default. Global Privacy Control and opt-outs are always honored.",
  },
  { key: "explicit", label: "Explicit", blurb: "Record nothing until your consent banner grants it." },
  { key: "off", label: "Off", blurb: "Collect nothing. The collector accepts the beacon and discards it." },
];

/** Why a touch was not recorded. Mirrors the collector's response `status`. */
export type CollectRefusal = "disabled" | "opted_out" | "gpc" | "consent_required";

export type CollectDecision = { allowed: true } | { allowed: false; reason: CollectRefusal };

export type CollectDecisionInput = {
  mode: JourneyConsentMode;
  /** True only when the page affirmatively signalled consent (banner accepted). */
  consentGiven?: boolean;
  /** The visitor sent Sec-GPC: 1 (or navigator.globalPrivacyControl / DNT). */
  gpc?: boolean;
  /** This anonymous id is on the workspace's suppression list. */
  optedOut?: boolean;
};

/**
 * Pure + total: decide whether a collector beacon may be recorded. Never throws.
 * An unknown/invalid mode is treated as `implied` by `normalizeConsentMode`, so
 * callers should normalize first.
 */
export function decideCollection(input: CollectDecisionInput): CollectDecision {
  if (input.mode === "off") return { allowed: false, reason: "disabled" };
  if (input.optedOut) return { allowed: false, reason: "opted_out" };
  if (input.gpc) return { allowed: false, reason: "gpc" };
  if (input.mode === "explicit" && input.consentGiven !== true) return { allowed: false, reason: "consent_required" };
  return { allowed: true };
}

/** Pure: coerce an untrusted value to a consent mode, defaulting to the safest sane mode. */
export function normalizeConsentMode(value: unknown): JourneyConsentMode {
  return (JOURNEY_CONSENT_MODES as readonly unknown[]).includes(value) ? (value as JourneyConsentMode) : "implied";
}

/** Pure: read a GPC/DNT opt-out signal from request headers. */
export function gpcFromHeaders(get: (name: string) => string | null): boolean {
  return get("sec-gpc") === "1" || get("dnt") === "1";
}
