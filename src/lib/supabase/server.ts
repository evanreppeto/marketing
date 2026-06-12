import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { type Database } from "./database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

let adminClient: TypedSupabaseClient | null = null;

// Per-call connect/response timeout. Kept low so a single unreachable Supabase
// call can't stall a request for the full default fetch timeout.
const SUPABASE_FETCH_TIMEOUT_MS = 2500;
// After a connection failure, skip live calls for this long and fail fast, so a
// page issuing several reads doesn't re-probe a known-down host on every query.
// The breaker probes again automatically once the cooldown elapses.
const SUPABASE_BREAKER_COOLDOWN_MS = 30_000;

/**
 * Surface a connection failure as an AbortError. postgrest-js retries failed
 * GET requests with exponential backoff (1s + 2s + 4s ≈ 7s) but treats an
 * AbortError as terminal — no retry. When Supabase is unreachable that retry
 * loop is pure latency (every read on every page stalls ~7s), so we convert the
 * failure into an abort and let callers fall back to defaults immediately.
 * Genuine caller aborts are passed through untouched.
 */
function asTerminalAbort(error: unknown): Error {
  if (error instanceof Error && (error.name === "AbortError" || (error as { code?: string }).code === "ABORT_ERR")) {
    return error;
  }
  const message = error instanceof Error ? error.message : "Supabase request failed";
  const abort = new Error(message);
  abort.name = "AbortError";
  (abort as { cause?: unknown }).cause = error;
  return abort;
}

/**
 * Wrap a fetch with a timeout and a one-strike circuit breaker. When the
 * underlying connection fails (DNS, refused, timeout), the breaker opens for
 * `cooldownMs`; calls made while it is open reject immediately instead of
 * hanging, so callers reach their graceful-degradation fallbacks fast. Failures
 * are surfaced as AbortErrors to suppress postgrest-js's retry backoff. A
 * caller-initiated abort never trips the breaker. Exported for unit testing;
 * production wires it over the global `fetch`.
 */
export function createResilientFetch(
  baseFetch: typeof fetch,
  options: { timeoutMs: number; cooldownMs: number; now?: () => number },
): typeof fetch {
  const { timeoutMs, cooldownMs } = options;
  const now = options.now ?? (() => Date.now());
  let breakerOpenUntil = 0;

  return async (input, init) => {
    if (now() < breakerOpenUntil) {
      throw asTerminalAbort(new Error("Supabase temporarily unreachable (circuit open); using fallback."));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const upstreamSignal = init?.signal;
    const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);

    if (upstreamSignal?.aborted) {
      controller.abort(upstreamSignal.reason);
    } else {
      upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
    }

    try {
      const response = await baseFetch(input, { ...init, signal: controller.signal });
      breakerOpenUntil = 0; // success: close the breaker
      return response;
    } catch (error) {
      // A caller-initiated abort is not a connectivity failure: don't trip the
      // breaker, and pass the original abort through.
      if (upstreamSignal?.aborted) throw error;
      breakerOpenUntil = now() + cooldownMs;
      throw asTerminalAbort(error);
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    }
  };
}

const supabaseFetch = createResilientFetch(fetch, {
  timeoutMs: SUPABASE_FETCH_TIMEOUT_MS,
  cooldownMs: SUPABASE_BREAKER_COOLDOWN_MS,
});

export function isSupabaseAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  adminClient ??= createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: supabaseFetch,
    },
  });

  return adminClient;
}
