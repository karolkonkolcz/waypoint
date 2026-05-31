'use client';

import { useState, useRef } from 'react';
import { UploadCloudIcon, MapIcon, AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import { parseGPX, GPXParseError } from '@/lib/gpx/parse';
import { routeRepo } from '@/lib/db/repositories/route.repo';
import type { RouteRow } from '@/lib/db/dexie';

interface Props {
  trailId: string;
  userId: string;
  existing?: RouteRow;
}

type Status = 'idle' | 'parsing' | 'error';

export function GpxUploadZone({ trailId, userId, existing }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus('parsing');
    setError('');
    try {
      const text = await file.text();
      const parsed = parseGPX(text);
      await routeRepo.upsert({ trail_id: trailId, user_id: userId, ...parsed, source: 'gpx' });
      setStatus('idle');
    } catch (err) {
      setError(err instanceof GPXParseError ? err.message : 'Failed to read GPX file');
      setStatus('error');
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".gpx"
      className="hidden"
      onChange={onInputChange}
    />
  );

  if (existing) {
    return (
      <div className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3">
        {fileInput}
        <div className="flex items-center gap-2 text-sm">
          <MapIcon className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-medium tabular-nums">
            {existing.total_distance_km} km &nbsp;·&nbsp; ↑{existing.total_ascent_m} m &nbsp;·&nbsp; ↓{existing.total_descent_m} m
          </span>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={status === 'parsing'}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="Replace GPX"
        >
          <RefreshCwIcon className={`h-3.5 w-3.5 ${status === 'parsing' ? 'animate-spin' : ''}`} />
          Replace
        </button>
      </div>
    );
  }

  return (
    <div>
      {fileInput}
      <button
        type="button"
        disabled={status === 'parsing'}
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="w-full rounded-2xl border-2 border-dashed border-border px-6 py-6 text-center transition-colors hover:border-primary/60 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'parsing' ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm">Parsing GPX…</span>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-2">
            <AlertCircleIcon className="h-6 w-6 text-destructive" />
            <span className="text-sm font-medium text-destructive">Upload failed — try again</span>
            <span className="text-xs text-muted-foreground">{error}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <UploadCloudIcon className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">Upload GPX file</span>
            <span className="text-xs text-muted-foreground">Tap or drag a .gpx file</span>
          </div>
        )}
      </button>
    </div>
  );
}
