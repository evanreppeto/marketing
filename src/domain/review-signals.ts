/**
 * Pure, deterministic mapping of business reviews (Google Business Profile / Yelp)
 * onto opportunity candidates — the classifier half of the reviews signal_source
 * connector (BSR-365). No I/O: the live review pull lives behind the injectable
 * ReviewSource in the connector runtime; this module only translates already-
 * fetched reviews into `review_signal` opportunities, so it stays unit-testable
 * against fixtures with no network.
 *
 * Guardrail: read-only. It NEVER replies to a review — a recovery/referral/
 * testimonial response only ever exists as an approval-gated campaign draft the
 * operator builds from the opportunity.
 */

import { type OpportunityCandidate } from "./opportunity-detection";

export type ReviewSentiment = "negative" | "neutral" | "positive";

/** A single fetched review, provider-agnostic. Only what the classifier reads. */
export type ReviewInput = {
  /** Stable per-review id (provider review id) — the dedup key. */
  id: string;
  /** 1–5 star rating. */
  rating: number;
  /** Reviewer display name, if provided. */
  author?: string;
  /** Short snippet — we keep a link + brief excerpt, never the full text (ToS). */
  snippet?: string;
  /** ISO timestamp the review was posted. */
  postedAt?: string;
  /** "google" | "yelp" | … */
  provider?: string;
  /** Business location label the review is for. */
  location?: string;
  /** Deep link to the review. */
  url?: string;
  /** CRM company id this location maps to, when linkable (kept in evidence). */
  companyId?: string;
};

export type ReviewDetectionConfig = {
  now: string;
  /** Reviews older than this many days aren't a fresh signal. Default 30. */
  recentDays?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_PERSONA = "persona_past_customer";

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

/** Star rating → sentiment bucket. 1–2 negative, 4–5 positive, 3 neutral. */
export function reviewSentiment(rating: number): ReviewSentiment {
  if (rating <= 2) return "negative";
  if (rating >= 4) return "positive";
  return "neutral";
}

function clampRating(rating: number): number {
  if (!Number.isFinite(rating)) return 0;
  return Math.min(5, Math.max(0, Math.round(rating)));
}

/**
 * Translate fetched reviews into opportunity candidates. Deterministic + read-only:
 *   • 3-star (neutral) reviews are skipped — no clear action.
 *   • reviews older than `recentDays` are skipped — not a fresh signal.
 *   • negative → service-recovery (urgency high when ≤7 days old, else medium);
 *   • positive → advocacy / referral + testimonial (urgency low).
 * subjectId is the review id, so upsertOpportunities' open-status dedup keeps
 * re-scans from doubling up. subjectType is "review" (external — no CRM FK); the
 * linkable CRM company id rides in evidence for the conversion to use.
 */
export function detectReviewSignalOpportunities(
  reviews: ReviewInput[],
  config: ReviewDetectionConfig,
): OpportunityCandidate[] {
  const recentDays = config.recentDays ?? 30;
  const seen = new Set<string>();
  const out: OpportunityCandidate[] = [];

  for (const review of reviews) {
    const id = (review.id ?? "").trim();
    if (!id || seen.has(id)) continue;

    const rating = clampRating(review.rating);
    const sentiment = reviewSentiment(rating);
    if (sentiment === "neutral") continue;

    const ageDays = review.postedAt ? daysBetween(review.postedAt, config.now) : null;
    if (ageDays !== null && ageDays > recentDays) continue;

    seen.add(id);

    const author = review.author?.trim() || "a customer";
    const provider = review.provider?.trim() || "review";
    const location = review.location?.trim();
    const url = typeof review.url === "string" && /^https?:\/\//i.test(review.url.trim()) ? review.url.trim() : null;
    const negative = sentiment === "negative";
    const fresh = ageDays !== null && ageDays <= 7;

    out.push({
      kind: "review_signal",
      subjectType: "review",
      subjectId: id,
      title: negative
        ? `${rating}★ review needs a response${location ? ` — ${location}` : ""}`
        : `${rating}★ review — referral & testimonial opening${location ? ` — ${location}` : ""}`,
      summary: negative
        ? `${author} left a ${rating}-star ${provider} review${location ? ` for ${location}` : ""}. A prompt, ` +
          `approval-gated service-recovery response protects the rating and can win the relationship back.`
        : `${author} left a ${rating}-star ${provider} review${location ? ` for ${location}` : ""}. A great moment to ` +
          `ask for a referral and permission to feature it as a testimonial — feeding an advocacy campaign.`,
      confidence: negative ? 85 : 68,
      urgency: negative ? (fresh ? "high" : "medium") : "low",
      evidence: {
        persona: REVIEW_PERSONA,
        rating,
        sentiment,
        provider,
        author,
        ...(review.snippet?.trim() ? { snippet: review.snippet.trim() } : {}),
        ...(location ? { location } : {}),
        ...(review.postedAt ? { postedAt: review.postedAt } : {}),
        ...(review.companyId ? { companyId: review.companyId } : {}),
        ...(url ? { evidence_urls: [url] } : {}),
      },
      recommendedAction: negative
        ? `Draft an approval-gated service-recovery response to ${author}'s ${rating}-star review and offer to make it right`
        : `Ask ${author} for a referral and permission to feature this ${rating}-star review as a testimonial`,
      recommendedCampaignType: negative ? "service_recovery" : "referral_request",
    });
  }

  return out;
}
