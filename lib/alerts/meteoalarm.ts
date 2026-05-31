/**
 * MeteoAlarm (EUMETNET) severe-weather warnings.
 *
 * Source: `https://feeds.meteoalarm.org/api/v1/warnings/feeds-{country}` — CAP
 * JSON, one entry per active warning. Shape (verified against the live SK feed):
 *
 *   { warnings: [ { alert: {
 *       info: [ {                       // one per language
 *         language: "en-GB" | "sk-SK" | …,
 *         event, headline, description, senderName, severity,
 *         onset, effective, expires,    // ISO timestamps
 *         area: [ { areaDesc, geocode } ],
 *         parameter: [ { valueName: "awareness_level", value: "2; yellow; Moderate" },
 *                      { valueName: "awareness_type",  value: "3; Thunderstorm" } ],
 *       } ]
 *   } } ] }
 *
 * The feed blocks browser CORS / default user-agents, so it is fetched through
 * our server proxy (`app/api/alerts/route.ts`). These helpers are pure so they
 * can be unit-tested without the network.
 */

export type AlertSeverity = 'yellow' | 'orange' | 'red';

export interface WeatherAlert {
  event: string;
  severity: AlertSeverity;
  onset: string | null;
  expires: string | null;
  areas: string[];
  description: string;
  sender: string;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { yellow: 1, orange: 2, red: 3 };

/** awareness_level "2; yellow; Moderate" → severity color (green/level 1 → null). */
function parseSeverity(value: string): AlertSeverity | null {
  const parts = value.split(';').map((s) => s.trim().toLowerCase());
  const color = parts[1];
  if (color === 'yellow' || color === 'orange' || color === 'red') return color;
  // Fallback: derive from the leading awareness level (1 green … 4 red).
  switch (parts[0]) {
    case '2':
      return 'yellow';
    case '3':
      return 'orange';
    case '4':
      return 'red';
    default:
      return null;
  }
}

/** awareness_type "3; Thunderstorm" → human label ("Thunderstorm"). */
function parseEventType(value: string): string {
  const parts = value.split(';').map((s) => s.trim());
  return parts[1] || parts[0] || 'Weather warning';
}

interface Param {
  valueName?: unknown;
  value?: unknown;
}

function paramValue(params: unknown, name: string): string | null {
  if (!Array.isArray(params)) return null;
  for (const p of params as Param[]) {
    if (p && p.valueName === name && typeof p.value === 'string') return p.value;
  }
  return null;
}

function pickInfo(info: unknown[]): Record<string, unknown> | null {
  if (info.length === 0) return null;
  // Prefer the English variant for display; otherwise take the first.
  const en = info.find(
    (i) =>
      typeof (i as { language?: unknown }).language === 'string' &&
      ((i as { language: string }).language).toLowerCase().startsWith('en'),
  );
  return (en ?? info[0]) as Record<string, unknown>;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function areaDescs(area: unknown): string[] {
  if (!Array.isArray(area)) return [];
  return area
    .map((a) => asString((a as { areaDesc?: unknown }).areaDesc))
    .filter((s) => s.length > 0);
}

/**
 * Normalize a MeteoAlarm feed into active, displayable alerts.
 * - Drops green / level-1 (advisory) and unparseable warnings.
 * - Drops already-expired warnings (relative to `now`).
 * - Deduplicates by (severity, event), merging affected area names — the feed
 *   repeats the same warning once per district.
 * - Sorts by severity, most severe first.
 */
export function parseMeteoalarmFeed(raw: unknown, now: number): WeatherAlert[] {
  const warnings = (raw as { warnings?: unknown })?.warnings;
  if (!Array.isArray(warnings)) return [];

  const byKey = new Map<string, WeatherAlert>();

  for (const w of warnings) {
    const info = (w as { alert?: { info?: unknown } })?.alert?.info;
    if (!Array.isArray(info)) continue;
    const chosen = pickInfo(info);
    if (!chosen) continue;

    const levelRaw = paramValue(chosen.parameter, 'awareness_level');
    if (!levelRaw) continue;
    const severity = parseSeverity(levelRaw);
    if (!severity) continue;

    const expires = asString(chosen.expires) || null;
    if (expires && Date.parse(expires) < now) continue; // already over

    const typeRaw = paramValue(chosen.parameter, 'awareness_type');
    const event = typeRaw ? parseEventType(typeRaw) : asString(chosen.event) || 'Weather warning';
    const onset = asString(chosen.onset) || asString(chosen.effective) || null;
    const areas = areaDescs(chosen.area);

    const key = `${severity}|${event}`;
    const existing = byKey.get(key);
    if (existing) {
      for (const a of areas) if (!existing.areas.includes(a)) existing.areas.push(a);
      if (onset && (!existing.onset || onset < existing.onset)) existing.onset = onset;
      if (expires && (!existing.expires || expires > existing.expires)) existing.expires = expires;
    } else {
      byKey.set(key, {
        event,
        severity,
        onset,
        expires,
        areas: [...areas],
        description: asString(chosen.description),
        sender: asString(chosen.senderName),
      });
    }
  }

  return [...byKey.values()].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

/** Highest severity across a set of alerts, or null if empty. */
export function maxSeverity(alerts: WeatherAlert[]): AlertSeverity | null {
  let best: AlertSeverity | null = null;
  for (const a of alerts) {
    if (!best || SEVERITY_RANK[a.severity] > SEVERITY_RANK[best]) best = a.severity;
  }
  return best;
}

// --- Country lookup -------------------------------------------------------
// MeteoAlarm feeds are keyed by the lowercase English country name. We map a
// route's coordinate to a country with a coarse bounding-box table (country-
// level matching per the agreed F5 scope — no per-region polygons). More
// specific island boxes (e.g. Corsica → france) are listed first so they win
// over the larger mainland boxes that would otherwise contain them.

interface CountryBox {
  slug: string;
  bbox: [number, number, number, number]; // [west, south, east, north]
}

const COUNTRY_BOXES: CountryBox[] = [
  { slug: 'france', bbox: [8.4, 41.3, 9.7, 43.1] }, // Corsica (before italy/france-mainland)
  { slug: 'slovakia', bbox: [16.8, 47.7, 22.6, 49.7] },
  { slug: 'czechia', bbox: [12.0, 48.5, 18.9, 51.1] },
  { slug: 'austria', bbox: [9.5, 46.3, 17.2, 49.1] },
  { slug: 'slovenia', bbox: [13.3, 45.4, 16.6, 46.9] },
  { slug: 'switzerland', bbox: [5.9, 45.8, 10.5, 47.9] },
  { slug: 'hungary', bbox: [16.1, 45.7, 22.9, 48.6] },
  { slug: 'croatia', bbox: [13.4, 42.3, 19.5, 46.6] },
  { slug: 'poland', bbox: [14.1, 49.0, 24.2, 54.9] },
  { slug: 'germany', bbox: [5.8, 47.2, 15.1, 55.1] },
  { slug: 'italy', bbox: [6.6, 36.6, 18.6, 47.1] },
  { slug: 'france', bbox: [-5.2, 41.3, 8.4, 51.1] }, // mainland (east capped to avoid italy/swiss)
  { slug: 'spain', bbox: [-9.4, 36.0, 3.4, 43.8] },
  { slug: 'portugal', bbox: [-9.6, 36.9, -6.2, 42.2] },
  { slug: 'norway', bbox: [4.5, 57.9, 31.1, 71.2] },
];

/** Map a lat/lon to a MeteoAlarm country slug, or null if outside coverage. */
export function slugFromLatLon(lat: number, lon: number): string | null {
  for (const { slug, bbox } of COUNTRY_BOXES) {
    if (lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]) return slug;
  }
  return null;
}
