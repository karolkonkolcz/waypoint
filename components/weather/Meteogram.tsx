'use client';

import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { MeteogramData } from '@/lib/weather/types';

interface Props {
  data: MeteogramData;
}

const SYNC_KEY = 'weather-meteogram';
const PANEL_HEIGHT = 110;
const TEMP_PANEL_HEIGHT = 150;

type PanelBuilder = {
  key: string;
  title: string;
  build: (
    root: HTMLElement,
    width: number,
    sync: uPlot.SyncPubSub,
    showXLabels: boolean,
  ) => uPlot;
};

/** Shared axis/scale helpers ------------------------------------------------ */

const axisStroke = 'rgba(120,120,120,0.9)';
const gridStroke = 'rgba(120,120,120,0.15)';

function timeAxis(showLabels: boolean): uPlot.Axis {
  return {
    scale: 'x',
    stroke: axisStroke,
    grid: { stroke: gridStroke, width: 1 },
    ticks: { stroke: gridStroke, width: 1 },
    // Tight spacing so a midday clock tick fits between day boundaries on a
    // 4-day phone-width axis (24h-only ticks would show dates but no time).
    space: 30,
    incrs: [3600, 6 * 3600, 12 * 3600, 24 * 3600],
    // Day boundaries get a date label; intermediate ticks show the clock time.
    values: showLabels
      ? (_u, splits) =>
          splits.map((s) => {
            const d = new Date(s * 1000);
            const h = d.getHours();
            if (h === 0)
              return d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric' });
            return `${String(h).padStart(2, '0')}:00`;
          })
      : () => [],
  };
}

function valueAxis(unit: string): uPlot.Axis {
  return {
    scale: unit,
    stroke: axisStroke,
    grid: { stroke: gridStroke, width: 1 },
    ticks: { stroke: gridStroke, width: 1 },
    size: 44,
  };
}

function baseOpts(
  width: number,
  height: number,
  sync: uPlot.SyncPubSub,
): Partial<uPlot.Options> {
  return {
    width,
    height,
    cursor: { sync: { key: sync.key }, points: { size: 5 } },
    legend: { show: false },
  };
}

/** Panel builders ----------------------------------------------------------- */

function buildPanels(data: MeteogramData): PanelBuilder[] {
  const x = data.time;
  const panels: PanelBuilder[] = [];

  // Temperature (line + optional daily min/max band) ------------------------
  if (data.temperature) {
    panels.push({
      key: 'temp',
      title: 'Teplota (°C)',
      build: (root, width, sync, showX) => {
        const hasBand = !!(data.tempMin && data.tempMax);
        const series: uPlot.Series[] = [{}];
        const seriesData: (number | null)[][] = [x];
        if (hasBand) {
          series.push(
            { scale: 't', stroke: 'transparent', fill: 'rgba(243,112,19,0.14)', points: { show: false } },
            { scale: 't', stroke: 'transparent', points: { show: false } },
          );
          seriesData.push(data.tempMax!, data.tempMin!);
        }
        series.push({ scale: 't', label: 'teplota', stroke: '#f37013', width: 2, points: { show: false } });
        seriesData.push(data.temperature!);
        return new uPlot(
          {
            ...baseOpts(width, TEMP_PANEL_HEIGHT, sync),
            scales: { x: { time: true }, t: {} },
            axes: [timeAxis(showX), valueAxis('t')],
            series,
          } as uPlot.Options,
          seriesData as uPlot.AlignedData,
          root,
        );
      },
    });
  }

  // Cloudiness (low / mid / high filled areas) ------------------------------
  if (data.cloudLow || data.cloudMid || data.cloudHigh) {
    panels.push({
      key: 'cloud',
      title: 'Oblačnost (%)',
      build: (root, width, sync, showX) =>
        new uPlot(
          {
            ...baseOpts(width, PANEL_HEIGHT, sync),
            scales: { x: { time: true }, c: { range: [0, 100] } },
            axes: [timeAxis(showX), valueAxis('c')],
            series: [
              {},
              { scale: 'c', label: 'vysoká', stroke: '#90a4ae', fill: 'rgba(144,164,174,0.4)', points: { show: false } },
              { scale: 'c', label: 'střední', stroke: '#607d8b', fill: 'rgba(96,125,139,0.4)', points: { show: false } },
              { scale: 'c', label: 'nízká', stroke: '#37474f', fill: 'rgba(55,71,79,0.4)', points: { show: false } },
            ],
          } as uPlot.Options,
          [
            x,
            data.cloudHigh ?? x.map(() => 0),
            data.cloudMid ?? x.map(() => 0),
            data.cloudLow ?? x.map(() => 0),
          ] as uPlot.AlignedData,
          root,
        ),
    });
  }

  // Precipitation (rain + snow stacked bars) --------------------------------
  if (data.rain || data.snow) {
    panels.push({
      key: 'precip',
      title: 'Srážky (mm)',
      build: (root, width, sync, showX) => {
        const bars = uPlot.paths.bars!({ size: [0.6, 24] });
        const rain = data.rain ?? x.map(() => 0);
        const snow = data.snow ?? x.map(() => 0);
        // Total drawn behind (snow colour), rain drawn on top → reads as stacked.
        const total = rain.map((r, i) => r + (snow[i] ?? 0));
        return new uPlot(
          {
            ...baseOpts(width, PANEL_HEIGHT, sync),
            scales: { x: { time: true }, p: { range: (_u, _min, max) => [0, Math.max(1, max)] } },
            axes: [timeAxis(showX), valueAxis('p')],
            series: [
              {},
              { scale: 'p', label: 'sníh', stroke: '#90caf9', fill: 'rgba(144,202,249,0.7)', paths: bars, points: { show: false } },
              { scale: 'p', label: 'déšť', stroke: '#1976d2', fill: 'rgba(25,118,210,0.8)', paths: bars, points: { show: false } },
            ],
          } as uPlot.Options,
          [x, total, rain] as uPlot.AlignedData,
          root,
        );
      },
    });
  }

  // Pressure (line) ---------------------------------------------------------
  if (data.pressure) {
    panels.push({
      key: 'pressure',
      title: 'Tlak (hPa)',
      build: (root, width, sync, showX) =>
        new uPlot(
          {
            ...baseOpts(width, PANEL_HEIGHT, sync),
            scales: { x: { time: true }, hpa: {} },
            axes: [timeAxis(showX), valueAxis('hpa')],
            series: [
              {},
              { scale: 'hpa', label: 'tlak', stroke: '#6a1b9a', width: 2, points: { show: false } },
            ],
          } as uPlot.Options,
          [x, data.pressure!] as uPlot.AlignedData,
          root,
        ),
    });
  }

  // Wind speed + gusts (two lines, gusts dashed) ----------------------------
  if (data.windSpeed) {
    panels.push({
      key: 'wind',
      title: 'Vítr (km/h)',
      build: (root, width, sync, showX) => {
        const series: uPlot.Series[] = [
          {},
          { scale: 'w', label: 'vítr', stroke: '#00838f', width: 2, points: { show: false } },
        ];
        const seriesData: (number | null)[][] = [x, data.windSpeed!];
        if (data.windGusts) {
          series.push({ scale: 'w', label: 'nárazy', stroke: '#00838f', width: 1, dash: [4, 4], points: { show: false } });
          seriesData.push(data.windGusts);
        }
        return new uPlot(
          {
            ...baseOpts(width, PANEL_HEIGHT, sync),
            scales: { x: { time: true }, w: {} },
            axes: [timeAxis(showX), valueAxis('w')],
            series,
          } as uPlot.Options,
          seriesData as uPlot.AlignedData,
          root,
        );
      },
    });
  }

  // Wind direction (scatter dots) -------------------------------------------
  if (data.windDir) {
    panels.push({
      key: 'winddir',
      title: 'Směr větru (°)',
      build: (root, width, sync, showX) =>
        new uPlot(
          {
            ...baseOpts(width, PANEL_HEIGHT, sync),
            scales: { x: { time: true }, d: { range: [0, 360] } },
            axes: [
              timeAxis(showX),
              { ...valueAxis('d'), incrs: [90], values: (_u, sp) => sp.map((v) => `${v}°`) },
            ],
            series: [
              {},
              { scale: 'd', label: 'směr', stroke: '#f37013', paths: () => null, points: { show: true, size: 4 } },
            ],
          } as uPlot.Options,
          [x, data.windDir!] as uPlot.AlignedData,
          root,
        ),
    });
  }

  return panels;
}

export default function Meteogram({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotsRef = useRef<uPlot[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data.time || data.time.length === 0) return;

    const sync = uPlot.sync(SYNC_KEY);
    const panels = buildPanels(data);
    const width = container.clientWidth || 320;
    const wrappers: HTMLDivElement[] = [];

    panels.forEach((panel) => {
      const wrap = document.createElement('div');
      wrap.className = 'mb-2';
      const title = document.createElement('p');
      title.className = 'mb-1 px-1 text-xs font-medium text-muted-foreground';
      title.textContent = panel.title;
      const root = document.createElement('div');
      wrap.append(title, root);
      container.appendChild(wrap);
      wrappers.push(wrap);
      // Every panel carries the time-axis labels so each stays readable on its
      // own while scrolling the stack.
      plotsRef.current.push(panel.build(root, width, sync, true));
    });

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      if (w > 0) for (const u of plotsRef.current) u.setSize({ width: w, height: u.height });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      for (const u of plotsRef.current) u.destroy();
      plotsRef.current = [];
      for (const wrap of wrappers) wrap.remove();
    };
  }, [data]);

  return (
    <div className="rounded-2xl border bg-card p-3">
      {data.limited && (
        <p className="mb-2 rounded-lg bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          Omezená data bez připojení — z uložené předpovědi zobrazujeme teplotu, srážky a vítr.
        </p>
      )}
      <div ref={containerRef} />
    </div>
  );
}
