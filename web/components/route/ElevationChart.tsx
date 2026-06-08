'use client';

import { cn } from '@/lib/utils';

interface ProfilePoint {
  d_km: number;
  ele_m: number;
}

interface Props {
  profile: ProfilePoint[];
  className?: string;
}

// Coordinate system: 400 × 110, padded so labels fit
const VB_W = 400;
const VB_H = 110;
const PAD = { top: 10, right: 8, bottom: 22, left: 44 };
const PLOT_W = VB_W - PAD.left - PAD.right; // 348
const PLOT_H = VB_H - PAD.top - PAD.bottom; // 78

export function ElevationChart({ profile, className }: Props) {
  if (profile.length < 2) return null;

  const maxDist = profile[profile.length - 1].d_km;
  const eles = profile.map((p) => p.ele_m);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const eleRange = maxEle - minEle || 1;

  const toXY = (d: number, e: number): [number, number] => [
    PAD.left + (d / maxDist) * PLOT_W,
    PAD.top + PLOT_H - ((e - minEle) / eleRange) * PLOT_H,
  ];

  const pts = profile.map((p) => toXY(p.d_km, p.ele_m));
  const plotBottom = PAD.top + PLOT_H;

  const lineD = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ');

  const areaD =
    `M${pts[0][0].toFixed(1)},${plotBottom} ` +
    pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') +
    ` L${pts[pts.length - 1][0].toFixed(1)},${plotBottom} Z`;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={cn('w-full text-primary', className)}
      aria-label={`Elevation profile: ${minEle}–${maxEle} m over ${maxDist.toFixed(1)} km`}
    >
      <defs>
        {/* Multiple ElevationChart on the same page would share this id;
            acceptable for the current layout (one chart per route). */}
        <linearGradient id="elev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {/* Baseline */}
      <line
        x1={PAD.left} y1={plotBottom}
        x2={PAD.left + PLOT_W} y2={plotBottom}
        className="text-border"
        stroke="currentColor"
        strokeWidth="1"
      />

      {/* Area fill */}
      <path d={areaD} fill="url(#elev-fill)" />

      {/* Elevation line */}
      <path
        d={lineD}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Y-axis: max elevation at top */}
      <text
        x={PAD.left - 4}
        y={PAD.top + 4}
        textAnchor="end"
        fontSize="9"
        className="fill-muted-foreground"
        fontFamily="var(--font-geist-mono, monospace)"
      >
        {Math.round(maxEle)} m
      </text>

      {/* Y-axis: min elevation at bottom */}
      <text
        x={PAD.left - 4}
        y={plotBottom}
        textAnchor="end"
        fontSize="9"
        className="fill-muted-foreground"
        fontFamily="var(--font-geist-mono, monospace)"
      >
        {Math.round(minEle)} m
      </text>

      {/* X-axis: start */}
      <text
        x={PAD.left}
        y={VB_H - 4}
        fontSize="9"
        className="fill-muted-foreground"
        fontFamily="var(--font-geist-mono, monospace)"
      >
        0
      </text>

      {/* X-axis: total distance */}
      <text
        x={PAD.left + PLOT_W}
        y={VB_H - 4}
        textAnchor="end"
        fontSize="9"
        className="fill-muted-foreground"
        fontFamily="var(--font-geist-mono, monospace)"
      >
        {maxDist.toFixed(1)} km
      </text>
    </svg>
  );
}
