import { describe, it, expect } from 'vitest';
import { getGreeting } from '../greeting';

function at(hour: number): Date {
  const d = new Date(2026, 5, 5, hour, 0, 0); // local time
  return d;
}

describe('getGreeting', () => {
  it('buckets the hours of the day', () => {
    expect(getGreeting(at(3), 'Tomáš')).toBe('Good night, Tomáš');
    expect(getGreeting(at(8), 'Tomáš')).toBe('Good morning, Tomáš');
    expect(getGreeting(at(14), 'Tomáš')).toBe('Good afternoon, Tomáš');
    expect(getGreeting(at(19), 'Tomáš')).toBe('Good evening, Tomáš');
    expect(getGreeting(at(23), 'Tomáš')).toBe('Good night, Tomáš');
  });

  it('uses the bucket boundaries', () => {
    expect(getGreeting(at(5), 'A')).toBe('Good morning, A');
    expect(getGreeting(at(12), 'A')).toBe('Good afternoon, A');
    expect(getGreeting(at(17), 'A')).toBe('Good evening, A');
    expect(getGreeting(at(21), 'A')).toBe('Good night, A');
  });

  it('drops the comma when there is no name', () => {
    expect(getGreeting(at(8), '')).toBe('Good morning');
    expect(getGreeting(at(8), '   ')).toBe('Good morning');
  });
});
