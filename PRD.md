# PRD.md

## Waypoint

Version: 1.0

Status: MVP Definition

Owner: Founder

> **See also:** `ARCHITECTURE.md` for the canonical database schema, RLS
> policies, IndexedDB schema, sync strategy, and directory structure.
> When this document and `ARCHITECTURE.md` conflict, `ARCHITECTURE.md` wins.

---

## Product Overview

Waypoint is a mobile-first, offline-first hiking itinerary application designed
for thru-hikers and long-distance backpackers.

The application helps hikers understand:

- today's route
- today's difficulty
- expected arrival times
- weather along the route
- weather warnings
- key points of interest

Waypoint is not intended to replace navigation software.

Waypoint complements navigation tools by acting as a digital trail book and
daily planning companion.

---

## Problem Statement

Current hiking tools focus primarily on navigation.

Most hikers still need to manually answer questions such as:

- How difficult will today be?
- When will I arrive?
- What weather will I encounter?
- Where will I be when the storm arrives?
- Where is the next water source?
- Where should I sleep tonight?

Information is often fragmented across:

- maps
- weather apps
- spreadsheets
- PDFs
- guidebooks

Waypoint consolidates these into a single experience.

---

## Target User

### Primary User

Long-distance hiker.

Examples:

- Pacific Crest Trail
- Appalachian Trail
- Colorado Trail
- Cesta hrdinov SNP
- Via Alpina

Characteristics:

- carries smartphone
- often has limited internet access
- plans daily mileage
- checks weather frequently
- needs reliable offline access

---

## Product Goals

**Goal 1**

Help hikers understand their day in under 10 seconds.

**Goal 2**

Remain fully usable without internet connection.

**Goal 3**

Provide meaningful ETA calculations.

**Goal 4**

Provide weather awareness along the route.

---

## Non Goals

Not part of MVP:

- social network
- chat
- messaging
- live tracking
- fitness competition
- AI chatbot
- public feeds
- marketplace

---

## Core User Stories

**Itinerary Creation**

As a hiker,
I want to create a trail itinerary,
so I can organize my hike.

**GPX Import**

As a hiker,
I want to import a GPX file,
so I do not need to manually create the route.

The imported track is stored as a GeoJSON LineString in the `routes` table and
is the basis for ETA position interpolation and map display.

**Stage Planning**

As a hiker,
I want to divide a trail into daily stages,
so I can understand each day separately.

**Daily View**

As a hiker,
I want to quickly see today's stage,
so I know what to expect.

**ETA**

As a hiker,
I want estimated arrival times,
so I can plan breaks and camps.

**Weather**

As a hiker,
I want weather forecasts along my route,
so I can prepare for conditions ahead.

**Offline Access**

As a hiker,
I want my itinerary available offline,
so I can use the app in remote areas.

---

## MVP Scope

### Authentication

Included.

Features:

- email login
- email one-time code login

No social providers initially.

Sign-in requires network once. After sign-in, the app is fully usable offline.

---

### Trail Management

Included.

User can:

- create trail
- edit trail
- delete trail

Fields:

- name
- description
- start date
- default hiking pace

---

### GPX Import

Included.

User can:

- upload GPX
- view route

Supported format:

- GPX

Imported track geometry is stored in `routes` (GeoJSON LineString) and is the
basis for map display, ETA interpolation, and weather sampling.

Future:

- KML
- GeoJSON

---

### Stage Management

Included.

User can:

- create stage
- edit stage
- reorder stage

Fields:

- title
- distance
- ascent
- descent
- notes

Each stage is one day and has a type:

- **trek** — a hiking day (distance, ascent, descent, route, ETA, weather).
- **transit** — a travel/rest day, planned as an editable timeline of
  milestones (bus, train, flight, transfer, check-in, meal, note) with an
  optional location anchor for weather.

A stage's date derives from the trail start date plus its order, and can be
overridden per stage. Each trek stage owns its own route (from one `<trk>` in
the imported GPX), so no manual distance offsets are needed.

---

### Daily Stage Screen

Included.

Displays:

- stage name
- distance
- ascent
- descent
- ETA
- weather summary
- difficulty

This is the primary screen of the application.

---

### Difficulty Engine

Included.

Input (MVP):

- distance
- ascent
- descent

Output:

- Easy
- Moderate
- Hard
- Extreme

Algorithm is deterministic and explainable. No AI scoring.

---

### ETA Engine

Included.

Based on:

- distance
- ascent
- user pace (stored on trail as `default_pace_kmh`)

Initial implementation:

- Naismith Rule

Future:

- Tobler Hiking Function

---

### Weather

Included.

Provider:

- Open-Meteo (no API key required)

Displays:

- temperature
- precipitation
- wind
- daily summary

Forecast is fetched for representative sample points along each stage and
cached for offline use. This enables answering "where will I be when the rain
starts?" by crossing ETA position with the forecast timeline.

---

### Weather Alerts

Included.

Displays:

- active weather warnings

Warning visibility only. No advanced alerting in MVP.

---

### Map

Included.

Provider:

- MapLibre

Displays:

- route
- current stage

Map is secondary to itinerary information. Map code is code-split and loaded
only on the map screen.

Offline tiles: per-trail region download via PMTiles. Fallback: route polyline
from cached geometry.

---

### Daily Dashboard (Today)

Included.

A single screen for the active trek that answers "what is today" at a glance:
today's stage, a one-line plain-language day briefing, a moving weather forecast
(start → moving → end, trimmed to the hours still ahead), and the day's
reminders.

---

### Reminders (To-dos)

Included.

Lightweight per-day to-dos, optionally pinned to a stage or date. Offline-first
and synced like the rest of the user's data. Surfaced on the dashboard.

---

### Current-Position Weather

Included.

A standalone weather screen, independent of any trail: geolocates the user (or a
searched place) and shows a multi-panel meteogram plus a past-radar overlay.
Falls back to the active trail's cached forecast when offline.

---

### Trail Cover Photos

Included.

Each trail can carry a cover photo, shown on the Home hero and trail cards.
Images are resized and converted to WebP in the browser before upload to keep
them small (offline-friendly, slow-network-friendly).

---

### Localization

The UI is currently presented in Czech.

---

### Offline Mode

Included.

User can:

- open itinerary
- browse stages
- view cached weather
- view cached map data

without internet.

The on-device database (IndexedDB / Dexie) is the primary data source. Supabase
is the sync target. The UI never waits on the network.

---

## Data Model

> Field-level types, indexes, RLS policies, and the Dexie schema are in
> `ARCHITECTURE.md`. This section shows the logical shape.

### profiles

id
email
display_name
units
created_at
updated_at

Mirrors `auth.users`. Do not create a separate `users` table.

---

### trails

id
user_id
name
description
start_date
default_pace_kmh
preferences
cover_image_url
created_at
updated_at
deleted_at

---

### routes

id
trail_id
stage_id
user_id
geojson
total_distance_km
total_ascent_m
total_descent_m
elevation_profile
source
created_at
updated_at
deleted_at

One route per **stage** (`stage_id`): each hiking day owns its own GeoJSON
LineString. A null `stage_id` is reserved for a future trail-level overview
geometry.

---

### stages

id
trail_id
user_id
title
order_index
date
stage_type
distance_km
ascent_m
descent_m
start_distance_km
end_distance_km
difficulty_score
difficulty_class
notes
timeline
location_lat
location_lon
location_name
created_at
updated_at
deleted_at

A stage is one day. `stage_type` is `trek` (a hiking day — distance, route,
weather) or `transit` (a travel/rest day — focus on an editable `timeline` of
milestones, with an optional `location_*` weather anchor). `date` overrides the
date otherwise derived from `trail.start_date + order_index`.

`start_distance_km` / `end_distance_km` are deprecated (each stage now owns its
own route, see `routes.stage_id`); kept for compatibility only.

---

### waypoints

id
trail_id
user_id
name
type
latitude
longitude
elevation_m
distance_along_route_km
description
created_at
updated_at
deleted_at

---

### weather_cache

id
trail_id
stage_id
user_id
latitude
longitude
forecast_json
valid_from
valid_to
fetched_at
created_at
updated_at
deleted_at

One row per stage per sample point. Not one blob per trail.

---

### todos

id
user_id
trail_id
stage_id
date
text
done
order_index
created_at
updated_at
deleted_at

Lightweight per-day reminders surfaced on the daily dashboard. Optionally pinned
to a stage and/or a calendar date; otherwise a trail-level reminder.

---

### welcome_photos / admin_users

Admin-managed photography for the public welcome screen. `welcome_photos` holds
the image metadata (storage path, public URL, alt text, sort order, active
flag); `admin_users` gates who may upload and manage them. Public visitors can
read active photos; only admins can write.

---

## Navigation Structure

**Welcome** — public landing screen for signed-out visitors (admin-curated
photography). Routes guests here before login.

**Onboarding** — first-run setup after the first sign-in.

**Home** — list of trails, with an active-trek hero and a live sync indicator.

**Today** — daily dashboard for the active trek: today's stage, a moving
weather forecast, and the day's to-do list.

**Trail** — trail overview + stage list.

**Stage** — daily stage details (primary screen). A trek day shows
distance/ascent/ETA/weather/map; a transit day shows an editable milestone
timeline.

**Weather** — current-position forecast (meteogram + radar), independent of any
trail.

**Map** — route visualization (code-split, secondary).

**Account / Settings** — profile, preferences, sign-out.

**Admin → Welcome photos** — admin-only management of welcome-screen imagery.

---

## Success Metrics

### Activation

User creates first trail.

Target: 80 %

---

### Engagement

User opens daily stage screen.

Target: 70 %

---

### Offline Reliability

Offline itinerary opens successfully.

Target: 99 %

---

### Performance

Initial load: < 2 seconds

Offline load: < 1 second

---

## Future Roadmap

### V2

- advanced ETA (Tobler Hiking Function)
- water sources
- campsites
- resupply points

---

### V3

- PDF export
- public sharing
- itinerary templates
- trail templates (split Trail / Itinerary entities)

---

### V4

- predictive weather positioning
- route alternatives
- advanced difficulty model (altitude and weather modifiers)

---

## Product Principle

A hiker should be able to wake up in a tent, open Waypoint without internet, and
understand the entire day in less than 10 seconds.
