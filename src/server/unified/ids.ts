import crypto from 'node:crypto';

export const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function stableId(...parts: Array<string | number | null | undefined>) {
  const key = parts
    .filter((part) => part !== null && part !== undefined && part !== '')
    .map((part) => String(part))
    .join('::');
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 24);
}

export function normalizeDayName(value?: string | null) {
  const lower = (value || '').trim().toLowerCase();
  const match = DAY_ORDER.find((day) => day.toLowerCase() === lower);
  return match || 'Monday';
}

export function nextOccurrenceIso(dayName: string, fromDate = new Date()) {
  const targetIndex = DAY_ORDER.indexOf(normalizeDayName(dayName));
  const date = new Date(fromDate);
  const currentIndex = date.getDay();
  let delta = targetIndex - currentIndex;
  if (delta < 0) {
    delta += 7;
  }
  date.setDate(date.getDate() + delta);
  date.setHours(8, 0, 0, 0);
  return date.toISOString();
}

export function toIsoDate(value?: string | null, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

export function buildTenantScopedKey(tenantId: string, legacyId?: string | null) {
  if (!legacyId) return null;
  return `${tenantId}:${legacyId}`;
}
