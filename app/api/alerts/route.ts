import { NextResponse } from 'next/server';
import { parseMeteoalarmFeed, slugFromLatLon } from '@/lib/alerts/meteoalarm';

// MeteoAlarm proxy. Browsers can't hit the feed directly (CORS + user-agent
// blocking), so the client calls this route with the stage coordinate; we
// resolve the country, fetch the CAP JSON server-side, and return normalized
// alerts. Any failure degrades to an empty list — the UI just shows nothing.

export async function GET(request: Request) {
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
