import { describe, it, expect } from 'vitest';
import { sortMilestones } from '../StageTimeline';
import type { Milestone } from '@/lib/db/dexie';

function m(id: string, time: string | null): Milestone {
  return { id, time, title: id, kind: 'note', location: null, notes: null };
}

describe('sortMilestones', () => {
  it('orders by time ascending', () => {
    const out = sortMilestones([m('c', '14:00'), m('a', '08:00'), m('b', '09:30')]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('sinks unscheduled (null time) milestones to the end', () => {
    const out = sortMilestones([m('x', null), m('a', '07:00'), m('y', null), m('b', '10:00')]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'x', 'y']);
  });

  it('does not mutate the input array', () => {
    const input = [m('b', '10:00'), m('a', '08:00')];
    const snapshot = input.map((x) => x.id);
    sortMilestones(input);
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });
});
