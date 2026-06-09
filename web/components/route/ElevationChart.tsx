'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

interface ProfilePoint {
  d_km: number;
  ele_m: number;
}

interface Props {
  profile: ProfilePoint[];
  marker?: {
    distanceKm: number;
    elevationM: number;
    label?: string;
  } | null;
  className?: string;
}

// Coordinate system: 400 x 142, close to the handoff while remaining responsive.
const VB_W = 400;
const VB_H = 142;
const PAD = { top: 14, right: 8, bottom: 24, left: 42 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  if (n <= 1) return pow;
  if (n <= 2) return 2 * pow;
  if (n <= 5) return 5 * pow;
  return 10 * pow;
}

function ticks(min: number, max: number, count: number): number[] {
  const step = niceStep((max - min) / Math.max(1, count - 1));
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.25; v += step) out.push(Math.round(v));
  return out.slice(0, count + 1);
}

export function ElevationChart({ profile, marker, className }: Props) {
  const gradientId = `elev-${useId().replace(/:/g, '')}`;
  if (profile.length < 2) return null;

  const maxDist = Math.max(profile[profile.length - 1].d_km, 0.1);
  const eles = profile.map((p) => p.ele_m);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const eleRangeRaw = maxEle - minEle || 1;
  const elePad = eleRangeRaw * 0.12;
  const yMin = minEle - elePad;
  const yMax = maxEle + elePad;
  const eleRange = yMax - yMin || 1;

  const toXY = (d: number, e: number): [number, number] => [
    PAD.left + (d / maxDist) * PLOT_W,
    PAD.top + PLOT_H - ((e - yMin) / eleRange) * PLOT_H,
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

  const yTicks = ticks(yMin, yMax, 3);
  const xStep = niceStep(maxDist / 4);
  const xTicks = Array.from(
    { length: Math.floor(maxDist / xStep) + 1 },
    (_, i) => i * xStep,
  ).filter((d) => d <= maxDist);
  if (xTicks[xTicks.length - 1] !== maxDist) xTicks.push(maxDist);

  const markerX =
    marker && maxDist > 0
      ? PAD.left + (Math.max(0, Math.min(maxDist, marker.distanceKm)) / maxDist) * PLOT_W
      : null;
  const markerY = marker ? toXY(marker.distanceKm, marker.elevationM)[1] : null;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={cn('w-full text-primary', className)}
      aria-label={`Elevation profile: ${minEle}–${maxEle} m over ${maxDist.toFixed(1)} km`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {yTicks.map((tick) => {
        const y = toXY(0, tick)[1];
        return (
          <g key={`y-${tick}`}>
            <line
              x1={PAD.left}
              y1={y}
              x2={PAD.left + PLOT_W}
              y2={y}
              className="text-border"
              stroke="currentColor"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 5}
              y={y + 3}
              textAnchor="end"
              fontSize="9"
              className="fill-muted-foreground"
              fontFamily="var(--font-geist-mono, monospace)"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {xTicks.map((tick) => {
        const x = toXY(tick, yMin)[0];
        return (
          <g key={`x-${tick}`}>
            <line
              x1={x}
              y1={PAD.top}
              x2={x}
              y2={plotBottom}
              className="text-border"
              stroke="currentColor"
              strokeWidth="1"
              strokeOpacity="0.55"
            />
            <text
              x={x}
              y={VB_H - 5}
              textAnchor={tick === 0 ? 'start' : tick === maxDist ? 'end' : 'middle'}
              fontSize="9"
              className="fill-muted-foreground"
              fontFamily="var(--font-geist-mono, monospace)"
            >
              {tick === maxDist ? `${maxDist.toFixed(1)} km` : tick}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaD} fill={`url(#${gradientId})`} />

      {/* Elevation line */}
      <path
        d={lineD}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {markerX !== null && markerY !== null && (
        <g aria-label={marker?.label ?? 'Srážky na trase'}>
          <line
            x1={markerX}
            y1={PAD.top}
            x2={markerX}
            y2={plotBottom}
            className="text-foreground"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
          <circle
            cx={markerX}
            cy={markerY}
            r="4.5"
            className="fill-card text-foreground"
            stroke="currentColor"
            strokeWidth="2"
          />
          <g
            transform={`translate(${Math.min(markerX + 6, PAD.left + PLOT_W - 15)},${PAD.top - 1})`}
            className="text-foreground"
            fill="currentColor"
          >
            <path d="M4 11.5a4 4 0 0 1 1.2-7.8A5.2 5.2 0 0 1 15.1 5a3.3 3.3 0 0 1 .6 6.5H4Z" />
            <path d="M9.8 7.3 7.6 12h2.1l-1 3.5 4-5h-2.2l1.3-3.2H9.8Z" />
          </g>
        </g>
      )}
    </svg>
  );
}
