import { NextResponse } from 'next/server';
import { parseMeteoalarmFeed, slugFromLatLon } from '@/lib/alerts/meteoalarm';

// MeteoAlarm proxy. Browsers can't hit the feed directly (CORS + user-agent
// blocking), so the client calls this route with the stage coordinate; we
// resolve the country, fetch the CAP JSON server-side, and return normalized
// alerts. Any failure degrades to an empty list — the UI just shows nothing.

// Lightweight in-memory fixed-window rate limit (audit L3). Keyed by client IP.
// On serverless this is per-instance and resets on cold start, which is fine —
// it only needs to blunt bursts against a cheap, 30-min-cached upstream feed.
const RATE_LIMIT = 60; // requests
const WINDOW_MS = 60_000; // per minute
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    // Opportunistically evict stale buckets so the map can't grow unbounded.
    if (hits.size > 10_000) {
      for (const [key, value] of hits) if (now > value.resetAt) hits.delete(key);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 });
  }

  const slug = slugFromLatLon(lat, lon);
  if (!slug) return NextResponse.json({ country: null, alerts: [] });

  try {
    const res = await fetch(`https://feeds.meteoalarm.org/api/v1/warnings/feeds-${slug}`, {
      headers: {
        'User-Agent': 'Waypoint/1.0 (offline hiking PWA)',
        Accept: 'application/json',
      },
      // Cache the upstream feed for 30 min across requests.
      next: { revalidate: 1800 },
    });
    if (!res.ok) return NextResponse.json({ country: slug, alerts: [] });

    const raw = await res.json();
    const alerts = parseMeteoalarmFeed(raw, Date.now());
    return NextResponse.json({ country: slug, alerts });
  } catch {
    return NextResponse.json({ country: slug, alerts: [] });
  }
}
