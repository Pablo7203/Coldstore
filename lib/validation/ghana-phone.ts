/** Normalize Ghana local or international input to +233 followed by nine digits. */
export function normalizeGhanaPhone(input: string): string | null {
  const compact = input.trim().replace(/[-\s()]/gu, "");

  if (/^0\d{9}$/u.test(compact)) return `+233${compact.slice(1)}`;
  if (/^\+?233\d{9}$/u.test(compact)) {
    return compact.startsWith("+") ? compact : `+${compact}`;
  }

  return null;
}
