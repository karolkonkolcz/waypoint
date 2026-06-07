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

/** Parses a coordinate string; returns null if not a finite number within ±max. */
function parseCoord(raw: string, max: number): number | null {
  const v = parseFloat(raw);
  return Number.isFinite(v) && Math.abs(v) <= max ? v : null;
}

export function TransitEditForm({ stage, onDone }: { stage: StageRow; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const [title, setTitle] = useState(stage.title);
  const [date, setDate] = useState(stage.date ?? '');
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

  // Validity (not just non-empty) drives the anchor, so bad manual input can't
  // masquerade as a set location and then get silently dropped on save.
  const latVal = parseCoord(lat, 90);
  const lonVal = parseCoord(lon, 180);
  const hasAnchor = latVal !== null && lonVal !== null;
  const latError = lat.trim() !== '' && latVal === null;
  const lonError = lon.trim() !== '' && lonVal === null;
  const partialCoords = (lat.trim() !== '') !== (lon.trim() !== '');
  const coordsInvalid = latError || lonError || partialCoords;

  // Trail routes give the picker geographic context (and auto-fit the trek).
  const trailRoutes = useLiveQuery(() => routeRepo.findAllByTrail(stage.trail_id), [stage.trail_id]);
  const allStages = useLiveQuery(() => stageRepo.findByTrail(stage.trail_id), [stage.trail_id]);
  const contextRoutes: MapRoute[] = useMemo(
    () =>
      (trailRoutes ?? [])
        .filter((r) => r.geojson.coordinates.length > 0)
        .map((r) => ({ id: r.id, geojson: r.geojson, color: DEFAULT_LINE_COLOR })),
    [trailRoutes],
  );

  // Neighbour endpoints: a transit day usually adjoins a trek day, so offer the
  // end of the previous stage's route and the start of the next stage's route.
  const neighbours = useMemo(() => {
    const ordered = allStages ?? [];
    const idx = ordered.findIndex((s) => s.id === stage.id);
    if (idx < 0) return { prevEnd: null, nextStart: null };
    const byStage = new Map(
      (trailRoutes ?? []).filter((r) => r.stage_id).map((r) => [r.stage_id as string, r]),
    );
    const endpoint = (s: StageRow | undefined, which: 'first' | 'last') => {
      const coords = s ? byStage.get(s.id)?.geojson.coordinates : undefined;
      if (!coords || coords.length === 0) return null;
      const c = which === 'first' ? coords[0] : coords[coords.length - 1];
      return { lat: c[1], lon: c[0] };
    };
    return {
      prevEnd: endpoint(idx > 0 ? ordered[idx - 1] : undefined, 'last'),
      nextStart: endpoint(idx < ordered.length - 1 ? ordered[idx + 1] : undefined, 'first'),
    };
  }, [allStages, trailRoutes, stage.id]);

  const markerPoint = latVal !== null && lonVal !== null ? { lat: latVal, lon: lonVal } : null;

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
        date: date || null,
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
      <h2 className="font-semibold">Upravit přesunový den</h2>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Název</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="např. Příjezd do Bastie"
          className="input"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Datum</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input"
        />
        <p className="text-xs text-muted-foreground">Nech prázdné, pokud se má datum řídit startem trasy.</p>
      </div>

      {/* Timeline editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Časová osa
          </span>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, blankMilestone()])}
            className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Přidat
          </button>
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            Zatím žádné milníky. Přidej časy autobusů, letů nebo přestupů.
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
                      placeholder="Název"
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
                      placeholder="Místo (volitelné)"
                      className="input"
                    />
                  </div>
                </div>
                <input
                  value={m.notes ?? ''}
                  onChange={(e) => patch(m.id, { notes: e.target.value || null })}
                  placeholder="Poznámky (volitelné)"
                  className="input"
                />
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => move(m.id, -1)}
                    disabled={idx === 0}
                    aria-label="Posunout nahoru"
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(m.id, 1)}
                    disabled={idx === items.length - 1}
                    aria-label="Posunout dolů"
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    aria-label="Smazat milník"
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
          Místo pro počasí
        </span>

        {hasAnchor ? (
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5">
            <MapPinIcon className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {locationName.trim() || 'Vlastní místo'}
              </p>
              <p className="text-xs text-muted-foreground">
                {lat}, {lon}
              </p>
            </div>
            <button
              type="button"
              onClick={clearAnchor}
              aria-label="Vymazat místo pro počasí"
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
              placeholder="Vyhledat místo (např. Bastia)"
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
          <p className="text-xs text-muted-foreground">Pro „{query.trim()}“ se nenašla žádná místa.</p>
        )}

        {!hasAnchor && (neighbours.prevEnd || neighbours.nextStart) && (
          <div className="flex flex-wrap gap-2">
            {neighbours.prevEnd && (
              <button
                type="button"
                onClick={() => pickOnMap(neighbours.prevEnd!.lat, neighbours.prevEnd!.lon)}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <MapPinIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Konec předchozího dne
              </button>
            )}
            {neighbours.nextStart && (
              <button
                type="button"
                onClick={() => pickOnMap(neighbours.nextStart!.lat, neighbours.nextStart!.lon)}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <MapPinIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Začátek dalšího dne
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {showMap ? 'Skrýt mapu' : 'Vybrat na mapě'}
          </button>
          {!hasAnchor && (
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {showManual ? 'Skrýt ruční zadání' : 'Zadat souřadnice ručně'}
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

        {(showManual || coordsInvalid) && !hasAnchor && (
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Zeměpisná šířka</label>
                <input
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  inputMode="decimal"
                  placeholder="42.7028"
                  aria-invalid={latError}
                  className={`input ${latError ? 'border-destructive' : ''}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Zeměpisná délka</label>
                <input
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                  inputMode="decimal"
                  placeholder="9.4503"
                  aria-invalid={lonError}
                  className={`input ${lonError ? 'border-destructive' : ''}`}
                />
              </div>
            </div>
            {latError && (
              <p className="text-xs text-destructive">Zeměpisná šířka musí být číslo mezi −90 a 90.</p>
            )}
            {lonError && (
              <p className="text-xs text-destructive">Zeměpisná délka musí být číslo mezi −180 a 180.</p>
            )}
            {partialCoords && !latError && !lonError && (
              <p className="text-xs text-destructive">Zadej zeměpisnou šířku i délku.</p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {hasAnchor
            ? 'Pro tento den se zobrazí předpověď. Klepnutím do mapy místo upravíš.'
            : 'Vyhledej místo nebo klepni do mapy, aby se pro tento den zobrazila předpověď.'}
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Poznámky</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Poznámky…"
          className="input resize-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-full border py-2.5 text-sm font-medium hover:bg-muted"
        >
          Zrušit
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || title.trim() === '' || coordsInvalid}
          className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Ukládám…' : 'Uložit'}
        </button>
      </div>
    </div>
  );
}
