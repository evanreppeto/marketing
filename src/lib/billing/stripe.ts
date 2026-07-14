import Stripe from "stripe";

// Lazily-created Stripe client, mirroring the Supabase admin client's
// configure-or-degrade posture. Everything Stripe-touching is gated by
// isStripeConfigured() so the app runs fine with no billing configured.

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

let cached: Stripe | null = null;

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  // Pin the account's default API version by omitting it; the SDK supplies a
  // compatible default so we don't couple to a version literal here.
  if (!cached) cached = new Stripe(key);
  return cached;
}
