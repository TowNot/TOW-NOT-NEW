/** North America default — London, ON. */
const DEFAULT_COUNTRY_CODE = "1";

/**
 * Normalize a user-entered phone number to E.164.
 * Accepts +15195551212, 519-555-1212, (519) 555-1212, 1 519 555 1212.
 */
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/[^\d+]/g, "");
  const plus = digits.startsWith("+");
  const numeric = digits.replace(/\D/g, "");
  if (numeric.length < 10 || numeric.length > 15) return null;

  let e164: string;
  if (plus) {
    e164 = `+${numeric}`;
  } else if (numeric.length === 10) {
    e164 = `+${DEFAULT_COUNTRY_CODE}${numeric}`;
  } else if (numeric.length === 11 && numeric.startsWith(DEFAULT_COUNTRY_CODE)) {
    e164 = `+${numeric}`;
  } else if (numeric.length > 11) {
    e164 = `+${numeric}`;
  } else {
    return null;
  }

  return /^\+[1-9]\d{9,14}$/.test(e164) ? e164 : null;
}
