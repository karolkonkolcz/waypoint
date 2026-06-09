# IOS_STRATEGY.md

> **Purpose.** `AGENTS.md` says *how* to build, `PRD.md` says *what* to build,
> `ARCHITECTURE.md` says *how the (web) system is shaped*. This document says
> *how the native iOS client realizes the same product against the same
> backend*. It is the source of truth for **iOS-specific** structural decisions.
>
> The backend contract is unchanged. `ARCHITECTURE.md` remains canonical for the
> **database schema, RLS, sync semantics, and the domain-engine math**. Where the
> Swift implementation must match a number or rule, `ARCHITECTURE.md` is the
> tiebreaker — this file never redefines those, it only ports them.

Status: iOS MVP definition · Version 0.1 · Learning/hobby project

---

## 0. Scope

- A **greenfield SwiftUI iOS app** talking to the **existing Supabase project**
  (same Postgres, RLS, auth, storage buckets, external APIs).
- The backend is **not modified** beyond one optional addition (an Edge Function
  for the MeteoAlarm proxy — see I7).
- The **PWA stays deployed** as the reference implementation and fallback. Do
  not deprecate it until bidirectional web↔iOS sync is proven (Phase 3).
- Favor **clarity over cleverness**. This is a vehicle for learning Swift,
  SwiftUI, GRDB, and a hand-rolled local-first sync engine.

---

## 1. Reuse vs. rebuild

**Reused as-is (no Swift work):**

| Asset | Notes |
|---|---|
| Postgres schema | `ARCHITECTURE.md §5` — unchanged |
| RLS policies | Owner-only, `auth.uid() = user_id` — unchanged |
| Auth (email OTP) | Same Supabase Auth |
| Storage buckets | `trail-covers`, `welcome-photos` — unchanged |
| External APIs | Open-Meteo, RainViewer, MeteoAlarm |

**Rebuilt in Swift (web code is not shareable):**

| Web (TypeScript) | Swift |
|---|---|
| Dexie / IndexedDB | **GRDB** (SQLite) |
| `web/lib/db/repositories/*` | repository structs over GRDB |
| `web/lib/db/sync.ts` | `SyncEngine.swift` |
| `web/lib/domain/{difficulty,eta,geo,stageDate}.ts` | pure Swift functions + unit tests |
| `web/lib/gpx/{parse,import}.ts` | `Gpx` parser via `XMLParser` |
| uPlot meteograms / hand-rolled SVG elevation | **Swift Charts** |
| `web/components/map/MapView` (MapLibre GL JS) | **MapLibre Native iOS** + `MapLibreSwiftUI` |
| PMTiles in OPFS | `.pmtiles` in app sandbox + `pmtiles://` |
| Zod schemas | `Codable` + a thin validation layer |
| `supabase-js` client | **supabase-swift** |
| `/api/alerts` (Next.js route) | Supabase Edge Function (or keep the Next route) |
| Service Worker app shell | n/a (native app) |

> **Single source of truth.** Domain logic now exists in two languages. The
> constants and algorithms in `ARCHITECTURE.md §10` are canonical; the Swift
> port must match them exactly, and any tuning change is made there first.

---

## 2. iOS decision record

Mirrors the `D1–D15` style in `ARCHITECTURE.md`. Each is binding for the iOS MVP.

| # | Decision | Rationale |
|---|---|---|
| **I1** | **Local store = GRDB**, not SwiftData / Core Data. | The sync model (LWW by `updated_at`, UUIDv7, `_dirty`, sync queue, soft deletes) is database-centric and maps to GRDB ~1:1. SwiftData's sync story is CloudKit-shaped and fights a custom Supabase sync. GRDB also matches the project's "boring, predictable, full-control" philosophy. |
| **I2** | Supabase access via **supabase-swift** (SPM). Offline is **hand-rolled** — the SDK has no built-in offline cache. | Official SDK mirrors `supabase-js`; offline is the same "local mirror" pattern already used with Dexie. |
| **I3** | Use the **new publishable key** (`sb_publishable_…`), not the legacy `anon` key. | Legacy keys are being deprecated; start clean. Service/secret keys never reach the client. |
| **I4** | Maps = **MapLibre Native iOS** wrapped by **MapLibreSwiftUI**. Offline = local `.pmtiles` file referenced via `pmtiles://`. | Parity with the web (same MapTiler style, same PMTiles model). Avoid the offline-pack-from-PMTiles path (known rough edges); store the region file in the sandbox instead — the OPFS equivalent. |
| **I5** | Charts = **Swift Charts**. | Native, declarative, replaces uPlot (meteograms) and the hand-rolled SVG elevation profile. |
| **I6** | IDs = **client-generated UUIDv7** via a small generator (Foundation `UUID` is v4 only). | Rows created on iOS must share the web's ID format so they sync without collision. |
| **I7** | MeteoAlarm proxy → **Supabase Edge Function** (port `web/lib/alerts/meteoalarm.ts`). Interim: keep calling the existing Next.js `/api/alerts`. | Open-Meteo and RainViewer are CORS-friendly and called directly from the device; only MeteoAlarm needs a proxy. An Edge Function removes the Next.js dependency long-term. |
| **I8** | Auth = **email OTP** via supabase-swift; session persisted in **Keychain**. | Matches `D7`: online once to verify the code, then fully offline; sync resumes when online. |
| **I9** | Reactive UI from **GRDB `ValueObservation`** feeding `@Observable` view models. | The UI observes the local DB and never blocks on the network — the iOS expression of "Dexie is the primary read source". |
| **I10** | Min deployment target **iOS 17+** (recommend 18). | Unlocks the `@Observable` macro and modern Swift Charts/concurrency; keeps the code modern without chasing the newest point release. |

---

## 3. Stack

- **Language/UI:** Swift 6, SwiftUI, Swift Concurrency (`async/await`, actors)
- **State:** `@Observable` view models; `ValueObservation` from GRDB
- **Local DB:** GRDB (SQLite), `DatabaseMigrator` for schema versions
- **Backend SDK:** supabase-swift (Auth, PostgREST, Storage, Realtime optional)
- **Maps:** MapLibre Native iOS + MapLibreSwiftUI
- **Charts:** Swift Charts
- **Networking:** `URLSession` + `Codable` for Open-Meteo / RainViewer / proxy
- **Dependency mgmt:** Swift Package Manager only

---

## 4. Architecture

```
┌───────────────────────── iOS device ─────────────────────────┐
│  SwiftUI Views                                                 │
│      │  observe                                                │
│  @Observable ViewModels                                        │
│      │  read (ValueObservation)         ┌── Domain engines ──┐ │
│  Repositories ──────────────────────────│ difficulty/eta/geo │ │
│      │  read/write                       └─────(pure)────────┘ │
│  GRDB (SQLite)  ← PRIMARY read source                          │
│      │  push/pull via                                          │
│  SyncEngine ───────────┐                                       │
└────────────────────────┼───────────────────────────────────── ┘
                         │ supabase-swift (online only)
                         ▼
                Supabase Postgres + RLS (durable store)
                Open-Meteo / RainViewer  ← direct from device
                MeteoAlarm  ← via Edge Function proxy
```

**Data-flow rules (identical intent to `ARCHITECTURE.md §2`):**

- **Reads:** View → ViewModel → Repository → **GRDB**. Never read Supabase to
  render a screen.
- **Writes:** Repository → GRDB (`_dirty = 1`) → enqueue `SyncOp` → background push.
- **Weather/alerts:** fetched from upstream when online, cached in GRDB, served
  from GRDB offline. These caches are **never pushed** to Supabase.

---

## 5. GRDB schema (mirror of the Dexie store)

Keep **snake_case column names identical to Postgres** so the same row shape
round-trips with no field renaming on sync. Map to Swift property names with
`CodingKeys`. Synced tables carry the sync columns; derived caches don't.

| Table | Synced? | Notes |
|---|:--:|---|
| `trails` | ✅ | |
| `routes` | ✅ | per-stage geometry; index `stage_id` |
| `stages` | ✅ | `stage_type`, `timeline` (JSON), `location_*`, `date` |
| `waypoints` | ✅ | |
| `todos` | ✅ | |
| `weather` | ❌ | trail/stage forecast cache, never pushed |
| `alerts` | ❌ | MeteoAlarm cache, never pushed |
| `ephemeral_weather` | ❌ | `/weather` current-position cache |
| `sync_queue` | — | pending `SyncOp`s |

Representative record + the syncable contract:

```swift
protocol SyncableRecord: Codable, FetchableRecord, MutablePersistableRecord {
    var id: String { get }            // UUIDv7
    var updatedAt: Date { get set }
    var deletedAt: Date? { get set }
}

struct Trail: SyncableRecord {
    var id: String
    var userId: String
    var name: String
    var description: String?
    var startDate: Date?
    var defaultPaceKmh: Double
    var preferences: String           // raw JSON text, mirrors jsonb
    var coverImageUrl: String?
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?
    var dirty: Bool                    // LOCAL ONLY — stripped before push

    static let databaseTableName = "trails"

    enum CodingKeys: String, CodingKey {
        case id, name, description, preferences
        case userId = "user_id"
        case startDate = "start_date"
        case defaultPaceKmh = "default_pace_kmh"
        case coverImageUrl = "cover_image_url"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
        case dirty = "_dirty"
    }
}
```

Use `DatabaseMigrator` for the local schema; each migration mirrors the intent
of the matching Postgres migration so an older install upgrades cleanly (same
discipline as the Dexie `version(N).upgrade()` backfills in `ARCHITECTURE.md §8`).

---

## 6. Sync engine (port of `ARCHITECTURE.md §9`)

Single-user-per-row ownership → no CRDTs. Same rules as the web:

- **Syncable entities:** `trails`, `routes`, `stages`, `waypoints`, `todos`.
- **Push (online):** drain `sync_queue` → `supabase.from(table).upsert(row)`
  (or set `deleted_at` for deletes). On success, clear `_dirty` and drop the op.
  Strip the local-only `_dirty` column from the payload.
- **Pull (online):** `select * where user_id = me and updated_at > lastPulledAt`.
  For each remote row, **last-write-wins by `updated_at`** vs. the local copy;
  apply tombstones (`deleted_at`); persist the new `lastPulledAt`.
- **IDs:** generate UUIDv7 at creation time on the client.
- **Triggers:** on app foreground, on connectivity regained
  (`NWPathMonitor`), and a light timer while foregrounded. Best-effort, never
  blocks the UI.
- **Optional later:** Supabase Realtime to push changes live instead of polling.
  Not needed for the MVP; the pull loop is sufficient.

`weather`, `alerts`, `ephemeral_weather` are derived caches — re-fetched from
upstream, never entered into the sync path.

---

## 7. Domain engine port (`ARCHITECTURE.md §10`)

Port verbatim — same constants, same outputs, same unit tests.

- `difficulty.swift` — `ASCENT_W = 0.85`, `DESCENT_W = 0.25`,
  `EXTREME_EFFORT_KM = 45`; same 0–100 score and class thresholds (25/50/75).
- `eta.swift` — Naismith now (`CLIMB_RATE_M_PER_H = 600`); Tobler behind the same
  interface for later. `positionAt(startTime, now, route)` powers ETA + weather.
- `geo.swift` — haversine, cumulative distance, `pointAtDistance` (linear
  interp). Hand-roll it; do **not** pull a heavyweight geo dependency.
- `stageDate.swift` — UTC-safe derive/override of the per-stage calendar date.

These are pure functions with no I/O → port them **first** (Phase 1) and lock
them with tests; everything else depends on them.

---

## 8. Phases

Each phase is runnable and compounds learning. Risk (sync) sits in the middle,
not at the start.

### Phase 0 — Spike
Xcode project, SwiftUI skeleton, supabase-swift via SPM, email-OTP login,
read existing `trails` from Supabase and list them.
**Done when:** you log in with your real account and see your real trails.

### Phase 1 — Read-only online client + domain engines
Home (trail list), Trail overview + stage list, Stage detail — reading directly
from Supabase. Port `difficulty`/`eta`/`geo`/`stageDate` to Swift with unit tests
and compute live on stage data.
**Done when:** stage screens show correct difficulty + ETA; domain tests pass.

### Phase 2 — GRDB + offline reads
Add GRDB, mirror the schema, build repositories, switch the UI to read from GRDB
via `ValueObservation`. Implement **pull** only.
**Done when:** the app opens and browses trails/stages in airplane mode.

### Phase 3 — Writes + full sync engine
Create/edit/delete through repos (write GRDB, `_dirty`, enqueue), then **push**,
LWW merge, soft deletes, UUIDv7. Test against the **same** Supabase as the web.
**Done when:** a trail edited on the web appears on iOS and vice versa, including
offline edits that reconcile on reconnect.

### Phase 4 — Weather
Open-Meteo direct → Swift Charts meteograms; per-stage sample-point cache;
"where will I be when the rain starts" (`positionAt × precipitation`). MeteoAlarm
via Edge Function. RainViewer past-radar overlay (degrade to empty state on
failure). GPX import may stay web-only initially; port the parser here if wanted.
**Done when:** an active stage shows a cached meteogram offline and the rain-onset
position online.

### Phase 5 — Maps
MapLibreSwiftUI map, MapTiler style, route polylines from local GRDB geometry
(difficulty colors), `fitBounds` to route. Then offline `.pmtiles` (download
region → sandbox → `pmtiles://`).
**Done when:** the route renders offline from the local PMTiles file.

### Phase 6 — Parity polish
Today dashboard, todos, current-position weather page, cover photos, settings,
onboarding, welcome screen.
**Done when:** feature parity with the PWA MVP.

---

## 9. DO NOT

- **Do not** try to share code between the web (TypeScript) and iOS (Swift)
  apps. They share the *backend contract* and `ARCHITECTURE.md`, nothing else.
- **Do not** use SwiftData's CloudKit sync. It fights the custom Supabase sync.
  (If you ever use SwiftData at all, treat it as a dumb local store with CloudKit
  off — but I1 says GRDB.)
- **Do not** read Supabase directly to render a screen. UI reads GRDB only.
- **Do not** push `weather` / `alerts` / `ephemeral_weather` to Supabase.
- **Do not** generate plain Foundation `UUID` (v4) for row IDs — must be UUIDv7.
- **Do not** crawl `tile.openstreetmap.org` for offline tiles. Use PMTiles.
- **Do not** use the legacy `anon` key in new code; use the publishable key.
- **Do not** deprecate or change the PWA until Phase 3 proves bidirectional sync.
- **Do not** re-tune difficulty/ETA constants here; change `ARCHITECTURE.md §10`
  first, then update both implementations.

---

## 10. Open decisions (revisit, don't pre-build)

- **Edge Function vs. keep Next.js `/api/alerts`** — start by reusing the Next
  route; move to an Edge Function when convenient (removes the Next dependency).
- **Realtime vs. pull loop** — pull loop for MVP; add Realtime only if live
  multi-device updates become worth it.
- **GPX import on iOS** — defer to web for v0; port `parseGPXTracks` (with the
  mapy.com reverse-order handling) when native import is needed.
- **iCloud backup of the local DB** — out of scope; Supabase is the durable store.

---

## 11. Local build & test workflow (agentic / CLI)

Builds and tests run through the **`ios/WaypointiOS/Makefile`**, not raw
`xcodebuild` invocations. It is tuned for driving the build from a CLI agent on
Apple Silicon (validated on an Air M2 / 16 GB) and exists to avoid three failure
modes that previously stalled sessions and overheated the machine:

1. **Cold simulator boot every run.** `make boot` boots *one* `iPhone 17`
   simulator and reuses it. Booting on demand inside `xcodebuild test` was the
   main cause of multi-minute "hangs".
2. **Full rebuild every run.** Targets split `build-for-testing` from
   `test-without-building` against a **fixed `DerivedData` at `.build/`**
   (gitignored), so the second phase is incremental instead of compiling from
   scratch.
3. **Invisible/blocking output.** Output streams through `xcbeautify` (readable
   progress, no `| tail` that only prints at EOF), and `xcodebuild` is wrapped in
   `gtimeout` so a stuck run dies instead of hanging the session.

**One-time setup:** `brew install xcbeautify coreutils` (the Makefile degrades
gracefully if either is missing — raw output, no timeout).

**Targets** (`make help` lists them):

| Command          | What it does                                            |
| ---------------- | ------------------------------------------------------- |
| `make test`      | Everyday loop: boot + incremental build + run tests     |
| `make build`     | Incremental `build-for-testing` only                    |
| `make test-only` | Run tests against the current binary (skips compile)    |
| `make run`       | Build & launch the app in the simulator                 |
| `make clean`     | Drop the `.build/` cache (forces a full rebuild)        |

Conventions:

- All targets pass `-skipMacroValidation` (MapLibre's Swift macro requires it
  in non-interactive builds).
- **Quit GUI Xcode while these run.** Two concurrent compiles (GUI indexing +
  CLI build) on 8 cores is the main source of thermal throttling.
- An allowlist for `make` / `xcodebuild` / `xcrun simctl` lives in
  `.claude/settings.json` (gitignored, personal) to cut permission prompts.

---

*This file pairs with `AGENTS.md`, `PRD.md`, and `ARCHITECTURE.md`. Keep all four
in the repo root. `ARCHITECTURE.md` wins on schema, sync semantics, and domain
math; this file wins on iOS-specific structure.*
