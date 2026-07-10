/**
 * Master kill-switch for real outbound sends.
 *
 * Live sending stays DARK until an operator explicitly sets `ARC_SEND_ENABLED=1`
 * in the environment. This sits on top of — not instead of — the two gates that
 * already exist: the per-connection `connections.enabled` toggle and the per-send
 * approval check in `executeResendDispatch`. It exists so a fresh or
 * mis-configured environment can never deliver mail by accident, and so the very
 * first real send is a deliberate act (flip the switch, send one test to
 * yourself, then widen). Mirrors the `ARC_MEDIA_ENABLED` pattern in
 * `src/lib/media`.
 */
export function isLiveSendEnabled(): boolean {
  return process.env.ARC_SEND_ENABLED === "1";
}
