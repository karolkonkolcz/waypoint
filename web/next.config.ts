import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Outbound hosts the client legitimately talks to (see audit L1):
//   *.supabase.co      REST + auth + storage + realtime (wss)
//   api.maptiler.com   vector tiles / style / glyphs (map view)
//   *.open-meteo.com   forecast + geocoding
//   api.bigdatacloud.net  reverse geocoding for current position
//   *.rainviewer.com   weather radar tiles
const connectSrc = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://api.maptiler.com",
  "https://api.open-meteo.com",
  "https://geocoding-api.open-meteo.com",
  "https://api.bigdatacloud.net",
  "https://api.rainviewer.com",
  "https://tilecache.rainviewer.com",
  "https://www.rainviewer.com",
  // Next.js HMR websocket in dev only.
  ...(isDev ? ["ws:", "http://localhost:*"] : []),
];

const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  "https://*.supabase.co",
  "https://api.maptiler.com",
  "https://*.rainviewer.com",
];

// Next.js injects inline bootstrap scripts without a nonce here, so script-src
// keeps 'unsafe-inline'. 'unsafe-eval' is dev-only (webpack HMR needs it); the
// production bundle (MapLibre v5, pmtiles, uPlot) runs without eval.
const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])];

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src ${scriptSrc.join(" ")}`,
  `img-src ${imgSrc.join(" ")}`,
  `connect-src ${connectSrc.join(" ")}`,
  // MapLibre runs its renderer in a blob worker.
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation is used by the "current position" weather; everything else off.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
