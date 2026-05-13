/**
 * Shared formatters. Everything that displays time anywhere in Get Fooked goes
 * through here so we don't end up with half the app in browser-local time
 * and half in UTC. We always render fixture times in NZ time because that's
 * where the crew lives.
 */

const NZ_LOCALE = 'en-NZ';
const NZ_ZONE = 'Pacific/Auckland';

export function fmtNzDateTime(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleString(NZ_LOCALE, {
    timeZone: NZ_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtNzTime(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleString(NZ_LOCALE, {
    timeZone: NZ_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtNzDay(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleDateString(NZ_LOCALE, {
    timeZone: NZ_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Detect whether NZ is currently observing daylight time (NZDT vs NZST). */
export function nzZoneAbbr(input: Date | string): 'NZST' | 'NZDT' {
  const d = typeof input === 'string' ? new Date(input) : input;
  // Render the offset via the long form, then read the offset hours.
  const fmt = new Intl.DateTimeFormat('en-NZ', {
    timeZone: NZ_ZONE,
    timeZoneName: 'short',
  });
  const parts = fmt.formatToParts(d);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  return tz.includes('NZDT') ? 'NZDT' : 'NZST';
}
