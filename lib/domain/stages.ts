export interface StageBoundary {
  id: string;
  start_distance_km: number;
  end_distance_km: number;
}

/**
 * Computes cumulative start/end distance boundaries for each stage along
 * a route. Stages are sorted by order_index before accumulation.
 *
 * Float drift is clamped to 3 decimal places (1 m precision).
 */
export function assignStageBoundaries(
  stages: { id: string; order_index: number; distance_km: number }[],
): StageBoundary[] {
  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
  let cum = 0;
  return sorted.map((s) => {
    const start = cum;
    cum = Math.round((cum + s.distance_km) * 1000) / 1000;
    return { id: s.id, start_distance_km: start, end_distance_km: cum };
  });
}
