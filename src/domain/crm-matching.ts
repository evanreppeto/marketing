/** Pure CRM record-matching keys. No I/O — used by the dedup persistence layer. */

export function normalizeEmailKey(email: string | null | undefined): string | null {
  const trimmed = (email ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePhoneKey(phone: string | null | undefined): string | null {
  let digits = (phone ?? "").replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits.length >= 7 ? digits : null;
}

export function normalizeDomain(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const host = raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .trim();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
}

export function normalizeAddressKey(
  streetLine1: string | null | undefined,
  postalCode: string | null | undefined,
): string | null {
  const street = (streetLine1 ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "");
  const postal = (postalCode ?? "").trim().toLowerCase();
  return street.length > 0 && postal.length > 0 ? `${street}|${postal}` : null;
}

export function isWithinWindow(aIso: string, bIso: string, windowMs: number): boolean {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= windowMs;
}
