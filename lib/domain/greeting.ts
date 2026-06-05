/**
 * Time-of-day greeting for the daily dashboard. Buckets match the wireframe:
 * <5 night, <12 morning, <17 afternoon, <21 evening, else night.
 * Pure and local-time based — recompute on mount, no need to tick.
 */
export function getGreeting(date: Date, name: string): string {
  const h = date.getHours();
  const word =
    h < 5 ? 'Good night'
    : h < 12 ? 'Good morning'
    : h < 17 ? 'Good afternoon'
    : h < 21 ? 'Good evening'
    : 'Good night';

  const trimmed = name.trim();
  return trimmed ? `${word}, ${trimmed}` : word;
}
