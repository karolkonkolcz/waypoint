'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloudIcon, AlertCircleIcon, MountainSnowIcon } from 'lucide-react';
import { GPXParseError } from '@/lib/gpx/parse';
import { buildTrekPreview, importTrek, type TrekPreview } from '@/lib/gpx/import';

interface Props {
  userId: string;
}

type Status = 'idle' | 'preview' | 'error';

// Guard against a huge file locking up the tab (text() + regex parse runs on the
// main thread). A real multi-day GPX is a few MB; 25 MB is a generous ceiling.
const MAX_GPX_BYTES = 25 * 1024 * 1024;

function dayLabel(count: number): string {
  if (count === 1) return 'den';
  if (count >= 2 && count <= 4) return 'dny';
  return 'dní';
}

export function GpxImportZone({ userId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<TrekPreview | null>(null);
  const [trailName, setTrailName] = useState('');
  const [startDate, setStartDate] = useState('');

  async function handleFile(file: File) {
    setError('');
    if (file.size > MAX_GPX_BYTES) {
      setError('Soubor GPX je příliš velký (max. 25 MB).');
      setStatus('error');
      return;
    }
    try {
      const text = await file.text();
      const p = buildTrekPreview(text, file.name);
      setPreview(p);
      setTrailName(p.trailName);
      setStartDate('');
      setStatus('preview');
    } catch (err) {
      setError(err instanceof GPXParseError ? err.message : 'Soubor GPX se nepodařilo přečíst');
      setStatus('error');
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  async function handleConfirm() {
    if (!preview) return;
    setImporting(true);
    try {
      const { trailId } = await importTrek(preview.tracks, {
        userId,
        trailName: trailName.trim() || preview.trailName,
        startDate: startDate || null,
      });
      router.push(`/trails/${trailId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import selhal');
      setImporting(false);
      setStatus('error');
    }
  }

  function reset() {
    setPreview(null);
    setStatus('idle');
    setError('');
  }

  const fileInput = (
    <input ref={inputRef} type="file" accept=".gpx" className="hidden" onChange={onInputChange} />
  );

  if (status === 'preview' && preview) {
    return (
      <div className="mb-6 space-y-4 rounded-2xl border bg-card p-4">
        {fileInput}
        <div className="flex items-center gap-2">
          <MountainSnowIcon className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Importovat trek</h2>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Název trasy</label>
          <input
            value={trailName}
            onChange={(e) => setTrailName(e.target.value)}
            className="input"
            placeholder="Název trasy"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Datum startu (volitelné — zapne počasí)</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input"
          />
        </div>

        <div className="rounded-xl bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">
            {preview.tracks.length} {dayLabel(preview.tracks.length)} · {preview.totalDistanceKm} km · ↑{preview.totalAscentM} m
          </span>
        </div>

        <ol className="space-y-1.5">
          {preview.tracks.map((t, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <span className="truncate">
                <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}.</span>
                {t.name ?? `Den ${i + 1}`}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {t.total_distance_km} km · ↑{t.total_ascent_m} m
              </span>
            </li>
          ))}
        </ol>

        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex-1 rounded-full border py-2.5 text-sm font-medium hover:bg-muted"
          >
            Zrušit
          </button>
          <button
            onClick={handleConfirm}
            disabled={importing}
            className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {importing ? 'Importuji…' : 'Vytvořit trasu'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      {fileInput}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:bg-muted/30"
      >
        <UploadCloudIcon className="h-5 w-5" />
        Importovat GPX trek
      </button>
      {status === 'error' && (
        <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
