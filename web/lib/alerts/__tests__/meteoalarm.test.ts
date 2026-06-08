import { describe, it, expect } from 'vitest';
import {
  parseMeteoalarmFeed,
  maxSeverity,
  slugFromLatLon,
  type WeatherAlert,
} from '@/lib/alerts/meteoalarm';

const NOW = Date.parse('2026-05-31T13:00:00Z');

// Builds a feed entry shaped like the real MeteoAlarm CAP JSON.
function warning(opts: {
  level: string;
  type?: string;
  area: string;
  expires: string;
  onset?: string;
  language?: string;
  description?: string;
}) {
  return {
    alert: {
      info: [
        {
          language: opts.language ?? 'en-GB',
          event: 'Generic event',
          description: opts.description ?? 'desc',
          senderName: 'SHMU',
          onset: opts.onset ?? '2026-05-31T14:00:00-00:00',
          expires: opts.expires,
          area: [{ areaDesc: opts.area, geocode: [{ value: 'SK000' }] }],
          parameter: [
            { valueName: 'awareness_level', value: opts.level },
            ...(opts.type ? [{ valueName: 'awareness_type', value: opts.type }] : []),
          ],
        },
      ],
    },
  };
}

describe('parseMeteoalarmFeed', () => {
  it('returns [] for a non-feed shape', () => {
    expect(parseMeteoalarmFeed(null, NOW)).toEqual([]);
    expect(parseMeteoalarmFeed({}, NOW)).toEqual([]);
    expect(parseMeteoalarmFeed({ warnings: 'nope' }, NOW)).toEqual([]);
  });

  it('parses severity and event type from awareness parameters', () => {
    const out = parseMeteoalarmFeed(
      { warnings: [warning({ level: '2; yellow; Moderate', type: '3; Thunderstorm', area: 'Pezinok', expires: '2026-05-31T17:45:00-00:00' })] },
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('yellow');
    expect(out[0].event).toBe('Bouřky');
    expect(out[0].areas).toEqual(['Pezinok']);
  });

  it('drops green / level-1 advisories', () => {
    const out = parseMeteoalarmFeed(
      { warnings: [warning({ level: '1; green; Minor', area: 'X', expires: '2026-05-31T18:00:00-00:00' })] },
      NOW,
    );
    expect(out).toEqual([]);
  });

  it('drops already-expired warnings', () => {
    const out = parseMeteoalarmFeed(
      { warnings: [warning({ level: '3; orange; Severe', area: 'X', expires: '2026-05-31T12:00:00-00:00' })] },
      NOW,
    );
    expect(out).toEqual([]);
  });

  it('deduplicates by (severity, event) and merges areas', () => {
    const out = parseMeteoalarmFeed(
      {
        warnings: [
          warning({ level: '2; yellow; Moderate', type: '3; Thunderstorm', area: 'Pezinok', expires: '2026-05-31T17:45:00-00:00' }),
          warning({ level: '2; yellow; Moderate', type: '3; Thunderstorm', area: 'Senec', expires: '2026-05-31T18:30:00-00:00' }),
        ],
      },
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].areas).toEqual(['Pezinok', 'Senec']);
    // latest expiry wins after merge
    expect(out[0].expires).toBe('2026-05-31T18:30:00-00:00');
  });

  it('sorts most severe first', () => {
    const out = parseMeteoalarmFeed(
      {
        warnings: [
          warning({ level: '2; yellow; Moderate', type: '1; Wind', area: 'A', expires: '2026-05-31T18:00:00-00:00' }),
          warning({ level: '4; red; Extreme', type: '3; Thunderstorm', area: 'B', expires: '2026-05-31T18:00:00-00:00' }),
        ],
      },
      NOW,
    );
    expect(out.map((a) => a.severity)).toEqual(['red', 'yellow']);
  });

  it('falls back to the leading level number when colour is unknown', () => {
    const out = parseMeteoalarmFeed(
      { warnings: [warning({ level: '4; ; Extreme', type: '2; Rain', area: 'A', expires: '2026-05-31T18:00:00-00:00' })] },
      NOW,
    );
    expect(out[0].severity).toBe('red');
  });
});

describe('maxSeverity', () => {
  it('returns null for no alerts', () => {
    expect(maxSeverity([])).toBeNull();
  });
  it('returns the most severe', () => {
    const alerts = [
      { severity: 'yellow' },
      { severity: 'orange' },
    ] as WeatherAlert[];
    expect(maxSeverity(alerts)).toBe('orange');
  });
});

describe('slugFromLatLon', () => {
  it('maps Slovak coordinates to slovakia', () => {
    expect(slugFromLatLon(48.7, 19.1)).toBe('slovakia');
  });
  it('maps Corsica to france (not italy)', () => {
    expect(slugFromLatLon(42.2, 9.1)).toBe('france');
  });
  it('maps mainland France', () => {
    expect(slugFromLatLon(45.8, 4.8)).toBe('france');
  });
  it('returns null outside coverage', () => {
    expect(slugFromLatLon(0, 0)).toBeNull();
  });
});
