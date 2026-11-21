/** Normalize Ghana local or international input to +233 followed by nine digits. */
export function normalizeGhanaPhone(input: string): string | null {
  const compact = input.trim().replace(/[-\s()]/gu, "");

  if (/^0\d{9}$/u.test(compact)) return `+233${compact.slice(1)}`;
  if (/^\+?233\d{9}$/u.test(compact)) {
    return compact.startsWith("+") ? compact : `+${compact}`;
  }

  return null;
}

/** Convert valid partial Ghana phone input into a prefix matching canonical stored values. */
export function normalizeGhanaPhoneSearchPrefix(input: string): string {
  const compact = input.trim().replace(/[-\s()]/gu, "");
  const normalized = normalizeGhanaPhone(compact);
  if (normalized) return normalized;
  if (/^0\d{1,8}$/u.test(compact)) return `+233${compact.slice(1)}`;
  if (/^\+?233\d{0,8}$/u.test(compact)) return `+${compact.replace(/^\+?/u, "")}`;
  return input.trim();
}
