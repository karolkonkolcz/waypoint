import { describe, it, expect } from 'vitest';
import { getGreeting } from '../greeting';

function at(hour: number): Date {
  const d = new Date(2026, 5, 5, hour, 0, 0); // local time
  return d;
}

describe('getGreeting', () => {
  it('buckets the hours of the day', () => {
    expect(getGreeting(at(3), 'Tomáš')).toBe('Dobrou noc, Tomáš');
    expect(getGreeting(at(8), 'Tomáš')).toBe('Dobré ráno, Tomáš');
    expect(getGreeting(at(14), 'Tomáš')).toBe('Dobré odpoledne, Tomáš');
    expect(getGreeting(at(19), 'Tomáš')).toBe('Dobrý večer, Tomáš');
    expect(getGreeting(at(23), 'Tomáš')).toBe('Dobrou noc, Tomáš');
  });

  it('uses the bucket boundaries', () => {
    expect(getGreeting(at(5), 'A')).toBe('Dobré ráno, A');
    expect(getGreeting(at(12), 'A')).toBe('Dobré odpoledne, A');
    expect(getGreeting(at(17), 'A')).toBe('Dobrý večer, A');
    expect(getGreeting(at(21), 'A')).toBe('Dobrou noc, A');
  });

  it('drops the comma when there is no name', () => {
    expect(getGreeting(at(8), '')).toBe('Dobré ráno');
    expect(getGreeting(at(8), '   ')).toBe('Dobré ráno');
  });
});
