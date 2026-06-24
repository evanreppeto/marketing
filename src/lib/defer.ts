import { after } from "next/server";

/**
 * Run best-effort, no-dependents work AFTER the response is sent, so it stops
 * adding latency to the request's critical path. Uses Next's `after()` (which
 * keeps the serverless function alive until the work finishes), and falls back
 * to fire-and-forget when there is no request scope (e.g. unit tests, where
 * `after()` throws). Errors are always swallowed — callers use this only for
 * telemetry / mirrors / wakes whose failure must never affect the response.
 */
export function deferAfterResponse(work: () => Promise<unknown> | unknown): void {
  const run = () => Promise.resolve().then(work).catch(() => undefined);
  try {
    after(() => run());
  } catch {
    // No request scope available — run it now without blocking the caller.
    void run();
  }
}
