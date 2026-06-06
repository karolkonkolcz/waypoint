import { describe, it, expect } from 'vitest';
import { selectVisibleSlots, MAX_VISIBLE_SLOTS } from '../visibleSlots';

type Phase = 'start' | 'moving' | 'end';
const phaseOf = (hour: number, start: number, arrival: number): Phase =>
  hour < start ? 'start' : hour <= arrival ? 'moving' : 'end';

// A full day: start 08:00, arrival 13:00. Hours 6..30 (30 = 06:00 next day).
const day = Array.from({ length: 25 }, (_, i) => {
  const hour = 6 + i;
  return { hour, phase: phaseOf(hour, 8, 13) };
});

describe('selectVisibleSlots', () => {
  it('06:00 — shows the start point first, then the moving phase', () => {
    const v = selectVisibleSlots(day, 6);
    expect(v[0].hour).toBe(6);
    expect(v.some((s) => s.phase === 'start')).toBe(true);
    expect(v.some((s) => s.phase === 'moving')).toBe(true);
  });

  it('08:00 — trims the hours that already passed', () => {
    const v = selectVisibleSlots(day, 8);
    expect(v[0].hour).toBe(8); // 06 and 07 dropped
    expect(v.every((s) => s.hour >= 8)).toBe(true);
    expect(v[0].phase).toBe('moving');
  });

  it('14:00 — past arrival, shows the destination weather', () => {
    const v = selectVisibleSlots(day, 14);
    expect(v[0].hour).toBe(14);
    expect(v.every((s) => s.phase === 'end')).toBe(true);
  });

  it('18:00 — evening, shows destination through the night', () => {
    const v = selectVisibleSlots(day, 18);
    expect(v[0].hour).toBe(18);
    expect(v.every((s) => s.phase === 'end')).toBe(true);
    // …and it reaches into the early hours of the next day (hour > 23).
    expect(v.some((s) => s.hour > 23)).toBe(true);
  });

  it('caps the window to MAX_VISIBLE_SLOTS', () => {
    expect(selectVisibleSlots(day, 8)).toHaveLength(MAX_VISIBLE_SLOTS);
  });

  it('without a current hour (future stage) shows from the start of the window', () => {
    const v = selectVisibleSlots(day, null);
    expect(v[0].hour).toBe(6);
    expect(v).toHaveLength(MAX_VISIBLE_SLOTS);
  });

  it('never renders empty when now is past the whole window', () => {
    const v = selectVisibleSlots(day, 40);
    expect(v.length).toBeGreaterThan(0);
    expect(v[v.length - 1].hour).toBe(30);
  });
});
