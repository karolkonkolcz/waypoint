import { describe, it, expect } from 'vitest';
import { addDays, stageDate, formatStageDate } from '../stageDate';

describe('addDays', () => {
  it('adds calendar days', () => {
    expect(addDays('2026-06-01', 0)).toBe('2026-06-01');
    expect(addDays('2026-06-01', 12)).toBe('2026-06-13');
  });

  it('rolls over month and year boundaries', () => {
    expect(addDays('2026-06-29', 3)).toBe('2026-07-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('stageDate', () => {
  it('returns the explicit date when set, regardless of the trail schedule', () => {
    expect(stageDate({ date: '2026-07-04', order_index: 2 }, '2026-06-01')).toBe('2026-07-04');
    expect(stageDate({ date: '2026-07-04', order_index: 0 }, null)).toBe('2026-07-04');
  });

  it('derives from trail start + order_index when no override', () => {
    expect(stageDate({ date: null, order_index: 0 }, '2026-06-01')).toBe('2026-06-01');
    expect(stageDate({ date: null, order_index: 12 }, '2026-06-01')).toBe('2026-06-13');
  });

  it('returns null when neither an override nor a trail start exists', () => {
    expect(stageDate({ date: null, order_index: 3 }, null)).toBeNull();
  });
});

describe('formatStageDate', () => {
  it('formats an ISO date without timezone drift', () => {
    expect(formatStageDate('2026-06-01')).toBe('po 1. 6.');
  });
});
