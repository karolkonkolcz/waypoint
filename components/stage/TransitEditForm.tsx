'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  PlusIcon,
  Trash2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
  MapPinIcon,
  SearchIcon,
  Loader2Icon,
  XIcon,
} from 'lucide-react';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { routeRepo } from '@/lib/db/repositories/route.repo';
import { newId } from '@/lib/db/repositories/base';
import type { StageRow, Milestone, MilestoneKind } from '@/lib/db/dexie';
import { searchPlaces, formatPlace, type GeocodeResult } from '@/lib/weather/geocoding';
import type { MapRoute } from '@/components/map/MapView';
import { DEFAULT_LINE_COLOR } from '@/components/map/colors';
import { MILESTONE_KINDS, MILESTONE_META } from './StageTimeline';

// MapLibre is heavy and browser-only — keep it out of the main bundle (§11).
const MapView = dynamic(() => import('@/components/map/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse bg-muted" />,
});

function blankMilestone(): Milestone {
  return { id: newId(), time: null, title: '', kind: 'transfer', location: null, notes: null };
}

export function TransitEditForm({ stage, onDone }: { stage: StageRow; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const [title, setTitle] = useState(stage.title);
  const [notes, setNotes] = useState(stage.notes ?? '');
  const [locationName, setLocationName] = useState(stage.location_name ?? '');
  const [lat, setLat] = useState(stage.location_lat?.toString() ?? '');
  const [lon, setLon] = useState(stage.location_lon?.toString() ?? '');
  const [items, setItems] = useState<Milestone[]>(stage.timeline);

  // Place search (Open-Meteo geocoding).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const skipSearch = useRef(false);

  const hasAnchor = lat.trim() !== '' && lon.trim() !== '';

  // Trail routes give the picker geographic context (and auto-fit the trek).
  const trailRoutes = useLiveQuery(() => routeRepo.findAllByTrail(stage.trail_id), [stage.trail_id]);
  const contextRoutes: MapRoute[] = useMemo(
    () =>
      (trailRoutes ?? [])
        .filter((r) => r.geojson.coordinates.length > 0)
        .map((r) => ({ id: r.id, geojson: r.geojson, color: DEFAULT_LINE_COLOR })),
    [trailRoutes],
  );

  const latN = parseFloat(lat);
  const lonN = parseFloat(lon);
  const markerPoint =
    Number.isFinite(latN) && Number.isFinite(lonN) ? { lat: latN, lon: lonN } : null;

  // Debounced search: refetch ~300ms after typing stops; abort stale requests.
  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        setResults(await searchPlaces(q, ctrl.signal));
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  function selectPlace(r: GeocodeResult) {
    skipSearch.current = true;
    setLocationName(r.name);
    setLat(r.latitude.toFixed(4));
    setLon(r.longitude.toFixed(4));
    setQuery('');
    setResults([]);
  }

  function clearAnchor() {
    setLocationName('');
    setLat('');
    setLon('');
    setQuery('');
    setResults([]);
    setShowManual(false);
  }

  // Map tap drops a custom point — coordinates only, so any stale name is cleared.
  const pickOnMap = useCallback((latNum: number, lonNum: number) => {
    skipSearch.current = true;
    setLat(latNum.toFixed(4));
    setLon(lonNum.toFixed(4));
    setLocationName('');
    setQuery('');
    setResults([]);
  }, []);

  function patch(id: string, change: Partial<Milestone>) {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, ...change } : m)));
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((m) => m.id !== id));
  }

  function move(id: string, dir: -1 | 1) {
    setItems((prev) => {
      const i = prev.findIndex((m) => m.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const parseCoord = (raw: string, max: number): number | null => {
    const v = parseFloat(raw);
    return Number.isFinite(v) && Math.abs(v) <= max ? v : null;
  };

  async function handleSave() {
    setPending(true);
    try {
      // Drop blank-title milestones; normalise empty strings to null.
      const timeline: Milestone[] = items
        .filter((m) => m.title.trim() !== '')
        .map((m) => ({
          ...m,
          title: m.title.trim(),
          time: m.time && m.time.trim() !== '' ? m.time : null,
          location: m.location && m.location.trim() !== '' ? m.location.trim() : null,
          notes: m.notes && m.notes.trim() !== '' ? m.notes.trim() : null,
        }));

      await stageRepo.update(stage.id, {
        title: title.trim(),
        notes: notes.trim() || null,
        timeline,
        location_name: locationName.trim() || null,
        location_lat: parseCoord(lat, 90),
        location_lon: parseCoord(lon, 180),
      });
      onDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mb-6 space-y-5 rounded-2xl border bg-card p-4">
      <h2 className="font-semibold">Edit Transit Day</h2>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Arrival in Bastia"
          className="input"
        />
      </div>

      {/* Timeline editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Timeline
          </span>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, blankMilestone()])}
            className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            No milestones. Add bus, flight or transfer times.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((m, idx) => (
              <div key={m.id} className="space-y-2 rounded-xl border bg-background p-3">
                <div className="flex items-center gap-2">
                  {/* .input is width:100%, so width is controlled by the wrapper. */}
                  <div className="w-28 shrink-0">
                    <input
                      type="time"
                      value={m.time ?? ''}
                      onChange={(e) => patch(m.id, { time: e.target.value || null })}
                      className="input"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      value={m.title}
                      onChange={(e) => patch(m.id, { title: e.target.value })}
                      placeholder="Title"
                      className="input"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32 shrink-0">
                    <select
                      value={m.kind}
                      onChange={(e) => patch(m.id, { kind: e.target.value as MilestoneKind })}
                      className="input"
                    >
                      {MILESTONE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {MILESTONE_META[k].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <input
                      value={m.location ?? ''}
                      onChange={(e) => patch(m.id, { location: e.target.value || null })}
                      placeholder="Location (optional)"
                      className="input"
                    />
                  </div>
                </div>
                <input
                  value={m.notes ?? ''}
                  onChange={(e) => patch(m.id, { notes: e.target.value || null })}
                  placeholder="Notes (optional)"
                  className="input"
                />
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => move(m.id, -1)}
                    disabled={idx === 0}
                    aria-label="Move up"
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(m.id, 1)}
                    disabled={idx === items.length - 1}
                    aria-label="Move down"
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    aria-label="Delete milestone"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weather anchor — search a place, coordinates fill in automatically. */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Weather location
        </span>

        {hasAnchor ? (
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5">
            <MapPinIcon className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {locationName.trim() || 'Custom location'}
              </p>
              <p className="text-xs text-muted-foreground">
                {lat}, {lon}
              </p>
            </div>
            <button
              type="button"
              onClick={clearAnchor}
              aria-label="Clear weather location"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-muted"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a place (e.g. Bastia)"
              className="input pl-9"
              autoComplete="off"
            />
            {searching && (
              <Loader2Icon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {results.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-card py-1 shadow-lg">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => selectPlace(r)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <MapPinIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{formatPlace(r)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!hasAnchor && query.trim().length >= 2 && !searching && results.length === 0 && (
          <p className="text-xs text-muted-foreground">No places found for “{query.trim()}”.</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {showMap ? 'Hide map' : 'Pick on map'}
          </button>
          {!hasAnchor && (
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {showManual ? 'Hide manual entry' : 'Enter coordinates manually'}
            </button>
          )}
        </div>

        {showMap && (
          <div className="overflow-hidden rounded-xl border">
            <MapView
              routes={contextRoutes}
              marker={markerPoint}
              onPick={pickOnMap}
              className="h-56 w-full"
            />
          </div>
        )}

        {showManual && !hasAnchor && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Latitude</label>
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                inputMode="decimal"
                placeholder="42.7028"
                className="input"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Longitude</label>
              <input
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                inputMode="decimal"
                placeholder="9.4503"
                className="input"
              />
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {hasAnchor
            ? 'Forecast will be shown for this day. Tap the map to adjust.'
            : 'Search or tap the map to show a forecast for this day.'}
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Notes…"
          className="input resize-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-full border py-2.5 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || title.trim() === ''}
          className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
