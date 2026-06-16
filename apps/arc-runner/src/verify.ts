import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify the app's wake signature. The app signs the raw request body with
 * HMAC-SHA256 keyed by MARK_WEBHOOK_SECRET and sends the hex digest in the
 * `x-webhook-signature` header. Hash the exact bytes received.
 */
export function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
