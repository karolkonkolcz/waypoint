import { describe, it, expect } from 'vitest';
import { resolveActiveTrail } from '../activeTrail';
import type { TrailRow } from '@/lib/db/dexie';

function trail(id: string, start_date: string | null): TrailRow {
  return {
    id,
    user_id: 'u',
    name: id,
    description: null,
    start_date,
    default_pace_kmh: 4,
    preferences: {},
    created_at: '',
    updated_at: '',
    deleted_at: null,
    _dirty: 0,
  };
}

describe('resolveActiveTrail', () => {
  it('returns null for no trails', () => {
    expect(resolveActiveTrail([], {}, '2026-06-05')).toBeNull();
  });

  it('picks the trail whose window covers today (inclusive bounds)', () => {
    const t = trail('a', '2026-06-01');
    const active = resolveActiveTrail([t], { a: 5 }, '2026-06-05'); // days 1..5 Jun
    expect(active?.id).toBe('a');
  });

  it('includes the last day of the window', () => {
    const t = trail('a', '2026-06-01');
    expect(resolveActiveTrail([t], { a: 5 }, '2026-06-05')?.id).toBe('a'); // Jun 1 + 4 = Jun 5
    expect(resolveActiveTrail([t], { a: 5 }, '2026-06-06')).toBe(t); // falls back, not in window
  });

  it('falls back to the most recent trail (first) when none is live', () => {
    const recent = trail('recent', '2030-01-01');
    const old = trail('old', '2020-01-01');
    const active = resolveActiveTrail([recent, old], { recent: 3, old: 3 }, '2026-06-05');
    expect(active?.id).toBe('recent');
  });

  it('prefers a live trail over the most-recent fallback', () => {
    const recent = trail('recent', '2030-01-01');
    const live = trail('live', '2026-06-04');
    const active = resolveActiveTrail([recent, live], { recent: 3, live: 3 }, '2026-06-05');
    expect(active?.id).toBe('live');
  });

  it('skips trails without a start date or with no stages', () => {
    const noDate = trail('nodate', null);
    const noStages = trail('nostages', '2026-06-01');
    const active = resolveActiveTrail([noDate, noStages], { nostages: 0 }, '2026-06-05');
    expect(active?.id).toBe('nodate'); // fallback to first, since neither is live
  });
});
