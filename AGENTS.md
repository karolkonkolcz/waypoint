# AGENTS.md

## Project

Waypoint is a mobile-first Progressive Web App (PWA) designed for thru-hikers
and long-distance backpackers.

The app allows users to create, import, edit, and consume hiking itineraries,
even in remote areas with poor or no internet connectivity.

Waypoint prioritizes:

1. Offline-first operation
2. Fast performance on slow mobile networks
3. Excellent readability while hiking
4. Minimal battery consumption
5. Simple UX optimized for outdoor use

> **Architecture reference:** `ARCHITECTURE.md` contains the canonical database
> schema, RLS policies, IndexedDB schema, sync strategy, and directory layout.
> Read it before writing any data-layer code. When this document and
> `ARCHITECTURE.md` conflict, `ARCHITECTURE.md` wins.

---

## Core Product Vision

Waypoint is not a navigation app.

Users already have navigation tools.

Waypoint answers:

- What is today's stage?
- How difficult will today be?
- Where will I likely be at 15:00?
- What weather can I expect?
- Is there a weather warning ahead?
- Where are water sources, camps, and resupply points?

The app should feel like a digital trail book.

---

## Technology Stack

### Frontend

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend

- Supabase
- PostgreSQL
- Row Level Security

### Maps

- MapLibre
- OpenStreetMap
- PMTiles (offline tile bundles)

### Offline Storage

- IndexedDB
- Dexie

### Hosting

- Vercel
- GitHub

### Weather

- Open-Meteo

---

## Development Philosophy

Prefer:

- simplicity
- maintainability
- boring technology
- predictable behavior

Avoid:

- unnecessary abstractions
- premature optimization
- over-engineering
- microservices

Follow YAGNI principles.

---

## Design Principles

### Mobile First

All screens must be designed for mobile before desktop.

Target width:

- 390px
- 430px

Desktop is secondary.

---

### Outdoor Readability

UI should remain usable:

- in bright sunlight
- with one hand
- while walking

Prefer:

- large touch targets
- large typography
- high contrast

Avoid:

- dense dashboards
- tiny controls
- excessive animations

---

### Offline First

Every itinerary must remain available offline.

The on-device database (IndexedDB via Dexie) is the **primary** read source.
Supabase is the durable backup and sync hub. The UI never blocks on the network.

Users should be able to:

- open itinerary
- browse stages
- view cached weather
- view maps

without internet connection.

Cloud synchronization is secondary. Local storage is primary.

---

### Slow Internet Friendly

Assume:

- mountain villages
- poor LTE
- unstable connectivity

Optimize:

- bundle size
- image size
- API usage

Avoid unnecessary requests.

---

## Data Model

> Full schema with SQL, RLS, and Dexie types is in `ARCHITECTURE.md §5` and
> `ARCHITECTURE.md §8`. This section describes the logical entities only.

### Profile

Represents an authenticated hiker. Mirrors `auth.users`. Do not create a
separate `users` table — use a `profiles` table keyed by `auth.users.id`.

---

### Trail

Represents a user's hike plan for a specific trip.

Contains:

- name and description
- start date
- default hiking pace (`default_pace_kmh`)
- preferences

**MVP decision:** Trail and Itinerary are merged into one entity for the MVP.
Splitting into shared trail templates + per-user itineraries is deferred to V3.
Do not build the split now.

---

### Route

Represents the geographic track of a trail.

Contains:

- full track as a GeoJSON LineString (from GPX import or manual creation)
- derived stats: total distance, ascent, descent
- downsampled elevation profile for charts

The Route is the source of truth for map rendering, ETA position interpolation,
and weather sampling points. One route per trail.

---

### Stage

Represents one hiking day.

Contains:

- distance, ascent, descent
- estimated hiking time (derived via ETA engine)
- difficulty score and class (derived via Difficulty engine)
- optional start/end distance offsets onto the Route for position interpolation

---

### Waypoint

Represents a point of interest on trail.

Examples:

- water source
- campsite
- shelter
- resupply
- town
- peak

---

### Weather Cache

Stores forecast snapshots for offline use.

One row per **stage per sample point** (start, midpoint(s), end). Not one blob
per trail. This granularity enables answering "where will I be when the rain
starts?" by crossing ETA-derived position with the forecast timeline.

---

## Difficulty Engine

Every stage receives a difficulty score.

Inputs (MVP):

- distance
- ascent
- descent

Output:

0–100 score

Classification:

- Easy
- Moderate
- Hard
- Extreme

The algorithm is deterministic and explainable. No AI scoring.

Optional modifiers (altitude, weather) are documented in `ARCHITECTURE.md §10.1`
but disabled by default for the MVP. Do not enable them until they are in scope.

---

## ETA Engine

Waypoint's primary differentiator.

Estimates:

- current position
- future position
- arrival times

Use:

- Naismith Rule (MVP)
- Tobler Hiking Function (future, interface already defined)

Prefer explainable calculations. The engine's `positionAt(time)` function maps
elapsed time to a lat/lon point along the Route's LineString.

---

## Weather System

Weather is fetched from Open-Meteo (no API key required) for representative
sample points along each stage. Forecasts are cached in Dexie and synced to
Supabase for offline access.

The system answers:

"Where will the hiker be when the rain starts?"

by crossing `positionAt(time)` with the hourly precipitation forecast.

---

## Maps

Maps are supporting functionality. The map must be **code-split** and loaded
only on the map screen — it must never affect the bundle size of the daily stage
screen or the trail list.

The itinerary remains the primary experience.

For offline maps, use PMTiles (a per-trail region download stored in OPFS). Do
not scrape raw OSM tile servers.

---

## UI Priorities

Priority order:

1. Today's stage
2. ETA
3. Weather
4. Difficulty
5. Water sources
6. Campsites
7. Map

---

## Performance Requirements

Lighthouse targets:

- Performance > 90
- Accessibility > 95
- Best Practices > 95

Initial load:

- under 2 seconds on 4G

Offline load:

- under 1 second

---

## Code Standards

Use:

- TypeScript strict mode
- server actions when appropriate (login flow and SSR shell only; data
  mutations go through Dexie + sync, not server actions)
- Zod validation
- reusable components

Avoid:

- `any`
- duplicated logic
- oversized components

Prefer composition over inheritance.

---

## ID Strategy

All rows use **client-generated UUIDv7** strings as primary keys.

Do not use database-generated sequential IDs. UUIDv7 is time-ordered, globally
unique, and allows offline creation without collision. The database accepts the
client's ID on insert.

---

## Sync Strategy

- **Writes:** write to Dexie first, mark `_dirty = 1`, enqueue a sync op.
- **Push:** when online, flush the sync queue to Supabase via upsert.
- **Pull:** fetch rows changed since `lastPulledAt`, merge with last-write-wins
  by `updated_at`.
- **Deletes:** soft-delete via `deleted_at` tombstone; never hard-delete in the
  sync path.
- **Conflicts:** last-write-wins is correct because every row is owned by
  exactly one user.

---

## Git Workflow

Small focused commits.

Commit format:

```
feat: add stage difficulty scoring
fix: correct ETA calculation
refactor: extract weather service
docs: update architecture notes
```

---

## Future Features

Not for MVP:

- social network
- chat
- AI assistant
- public feeds
- gamification
- trail templates / shared itineraries (V3)
- altitude and weather difficulty modifiers (V4)

Focus on solving real thru-hiker problems first.

---

## Success Metric

A hiker should be able to wake up in a tent, open Waypoint with no internet
connection, and immediately understand:

- today's route
- today's difficulty
- today's weather
- where they will likely be throughout the day

within 10 seconds.
