'use client';

import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    // Skip in development — avoids confusing stale-cache issues during work.
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(console.error);
  }, []);

  return null;
}
