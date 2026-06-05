/**
 * Human-friendly duration from a fractional hour count.
 * e.g. 0.5 → "30 min", 1 → "1h", 2.25 → "2h 15m".
 */
export function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
