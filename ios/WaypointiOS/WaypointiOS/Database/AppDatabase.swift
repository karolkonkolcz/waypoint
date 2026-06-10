import Foundation
import GRDB

// Single SQLite store for the app (DatabasePool = concurrent reads + serialised writes).
// Schema is versioned via DatabaseMigrator — each migration runs exactly once and is
// tracked in an internal `grdb_migrations` table.
//
// Column names mirror Postgres exactly (snake_case) so rows round-trip via sync without
// field renaming. See IOS_STRATEGY.md §5 for the full schema contract.

final class AppDatabase: Sendable {

    let dbPool: DatabasePool

    // Shared instance wired to the app's Application Support directory.
    static let shared: AppDatabase = {
        do {
            let dir = try FileManager.default.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            let url = dir.appendingPathComponent("waypoint.sqlite")
            return try AppDatabase(url: url)
        } catch {
            fatalError("Cannot open AppDatabase: \(error)")
        }
    }()

    init(url: URL) throws {
        dbPool = try DatabasePool(path: url.path)
        try applyMigrations(dbPool)
    }

    // MARK: - Reset

    /// Wipe every table (trails, stages, routes, waypoints, todos, caches,
    /// sync_metadata, sync_queue) and rebuild the empty schema. Used on sign-out
    /// so a different account never sees the previous user's local-first cache.
    func eraseAllData() async throws {
        try await dbPool.erase()
        try applyMigrations(dbPool)
    }

    // MARK: - Migrations

    private func applyMigrations(_ writer: DatabaseWriter) throws {
        var m = DatabaseMigrator()

        m.registerMigration("v1_trails_stages_sync_metadata") { db in
            // trails — synced entity
            try db.create(table: "trails", ifNotExists: true) { t in
                t.primaryKey("id", .text)
                t.column("user_id", .text).notNull()
                t.column("name", .text).notNull()
                t.column("description", .text)
                t.column("start_date", .text)            // DATE → "YYYY-MM-DD" string
                t.column("default_pace_kmh", .double).notNull().defaults(to: 4.0)
                t.column("cover_image_url", .text)
                t.column("created_at", .double).notNull() // Unix timestamp
                t.column("updated_at", .double).notNull()
                t.column("deleted_at", .double)
                t.column("_dirty", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_trails_user_id", on: "trails", columns: ["user_id"])
            try db.create(index: "idx_trails_updated_at", on: "trails", columns: ["updated_at"])

            // stages — synced entity
            try db.create(table: "stages", ifNotExists: true) { t in
                t.primaryKey("id", .text)
                t.column("trail_id", .text).notNull()
                    .references("trails", column: "id", onDelete: .cascade)
                t.column("title", .text).notNull()
                t.column("order_index", .integer).notNull()
                t.column("stage_type", .text).notNull().defaults(to: "trek")
                t.column("distance_km", .double).notNull().defaults(to: 0)
                t.column("ascent_m", .double).notNull().defaults(to: 0)
                t.column("descent_m", .double).notNull().defaults(to: 0)
                t.column("difficulty_score", .integer)
                t.column("difficulty_class", .text)
                t.column("date", .text)                  // DATE override "YYYY-MM-DD"
                t.column("start_distance_km", .double)
                t.column("end_distance_km", .double)
                t.column("location_name", .text)
                t.column("location_lat", .double)
                t.column("location_lon", .double)
                t.column("notes", .text)
                t.column("timeline", .text)              // jsonb stored as JSON text
                t.column("created_at", .double).notNull()
                t.column("updated_at", .double).notNull()
                t.column("deleted_at", .double)
                t.column("_dirty", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_stages_trail_id", on: "stages", columns: ["trail_id"])
            try db.create(
                index: "idx_stages_trail_order",
                on: "stages",
                columns: ["trail_id", "order_index"]
            )
            try db.create(index: "idx_stages_updated_at", on: "stages", columns: ["updated_at"])

            // sync_metadata — one row per entity key, e.g. "trails_lastPulledAt"
            try db.create(table: "sync_metadata", ifNotExists: true) { t in
                t.primaryKey("key", .text)
                t.column("value", .text).notNull()
            }
        }

        m.registerMigration("v2_full_phase2_local_mirror") { db in
            try db.alter(table: "trails") { t in
                t.add(column: "preferences", .text).notNull().defaults(to: "{}")
            }

            try db.alter(table: "stages") { t in
                t.add(column: "user_id", .text).notNull().defaults(to: "")
            }
            try db.execute(sql: """
                UPDATE stages
                SET user_id = (
                    SELECT trails.user_id FROM trails WHERE trails.id = stages.trail_id
                )
                WHERE user_id = ''
            """)
            try db.create(index: "idx_stages_user_id", on: "stages", columns: ["user_id"])

            try db.create(table: "routes", ifNotExists: true) { t in
                t.primaryKey("id", .text)
                t.column("trail_id", .text).notNull()
                    .references("trails", column: "id", onDelete: .cascade)
                t.column("stage_id", .text)
                    .references("stages", column: "id", onDelete: .cascade)
                t.column("user_id", .text).notNull()
                t.column("geojson", .text).notNull()
                t.column("total_distance_km", .double).notNull()
                t.column("total_ascent_m", .integer).notNull()
                t.column("total_descent_m", .integer).notNull()
                t.column("elevation_profile", .text).notNull().defaults(to: "[]")
                t.column("source", .text).notNull().defaults(to: "gpx")
                t.column("created_at", .double).notNull()
                t.column("updated_at", .double).notNull()
                t.column("deleted_at", .double)
                t.column("_dirty", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_routes_trail_id", on: "routes", columns: ["trail_id"])
            try db.create(index: "idx_routes_stage_id", on: "routes", columns: ["stage_id"])
            try db.create(index: "idx_routes_user_id", on: "routes", columns: ["user_id"])
            try db.create(index: "idx_routes_updated_at", on: "routes", columns: ["updated_at"])

            try db.create(table: "waypoints", ifNotExists: true) { t in
                t.primaryKey("id", .text)
                t.column("trail_id", .text).notNull()
                    .references("trails", column: "id", onDelete: .cascade)
                t.column("user_id", .text).notNull()
                t.column("name", .text).notNull()
                t.column("type", .text).notNull()
                t.column("latitude", .double).notNull()
                t.column("longitude", .double).notNull()
                t.column("elevation_m", .integer)
                t.column("distance_along_route_km", .double)
                t.column("description", .text)
                t.column("created_at", .double).notNull()
                t.column("updated_at", .double).notNull()
                t.column("deleted_at", .double)
                t.column("_dirty", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_waypoints_trail_id", on: "waypoints", columns: ["trail_id"])
            try db.create(index: "idx_waypoints_type", on: "waypoints", columns: ["type"])
            try db.create(index: "idx_waypoints_user_id", on: "waypoints", columns: ["user_id"])
            try db.create(index: "idx_waypoints_updated_at", on: "waypoints", columns: ["updated_at"])

            try db.create(table: "todos", ifNotExists: true) { t in
                t.primaryKey("id", .text)
                t.column("user_id", .text).notNull()
                t.column("trail_id", .text).notNull()
                    .references("trails", column: "id", onDelete: .cascade)
                t.column("stage_id", .text)
                    .references("stages", column: "id", onDelete: .cascade)
                t.column("date", .text)
                t.column("text", .text).notNull()
                t.column("done", .boolean).notNull().defaults(to: false)
                t.column("order_index", .integer).notNull().defaults(to: 0)
                t.column("created_at", .double).notNull()
                t.column("updated_at", .double).notNull()
                t.column("deleted_at", .double)
                t.column("_dirty", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_todos_trail_id", on: "todos", columns: ["trail_id"])
            try db.create(index: "idx_todos_stage_id", on: "todos", columns: ["stage_id"])
            try db.create(index: "idx_todos_trail_done", on: "todos", columns: ["trail_id", "done"])
            try db.create(index: "idx_todos_user_id", on: "todos", columns: ["user_id"])
            try db.create(index: "idx_todos_updated_at", on: "todos", columns: ["updated_at"])

            try db.create(table: "weather", ifNotExists: true) { t in
                t.primaryKey("id", .text)
                t.column("trail_id", .text).notNull()
                t.column("stage_id", .text)
                t.column("user_id", .text).notNull()
                t.column("latitude", .double).notNull()
                t.column("longitude", .double).notNull()
                t.column("forecast_json", .text).notNull()
                t.column("valid_from", .double)
                t.column("valid_to", .double)
                t.column("fetched_at", .double).notNull()
            }
            try db.create(index: "idx_weather_trail_id", on: "weather", columns: ["trail_id"])
            try db.create(index: "idx_weather_stage_id", on: "weather", columns: ["stage_id"])
            try db.create(index: "idx_weather_fetched_at", on: "weather", columns: ["fetched_at"])

            try db.create(table: "alerts", ifNotExists: true) { t in
                t.primaryKey("trail_id", .text)
                t.column("country", .text)
                t.column("alerts_json", .text).notNull()
                t.column("fetched_at", .double).notNull()
            }
            try db.create(index: "idx_alerts_fetched_at", on: "alerts", columns: ["fetched_at"])

            try db.create(table: "ephemeral_weather", ifNotExists: true) { t in
                t.primaryKey("cache_key", .text)
                t.column("forecast_json", .text).notNull()
                t.column("fetched_at", .double).notNull()
            }
            try db.create(
                index: "idx_ephemeral_weather_fetched_at",
                on: "ephemeral_weather",
                columns: ["fetched_at"]
            )

            try db.create(table: "sync_queue", ifNotExists: true) { t in
                t.autoIncrementedPrimaryKey("seq")
                t.column("entity", .text).notNull()
                t.column("op", .text).notNull()
                t.column("row_id", .text).notNull()
                t.column("created_at", .text).notNull()
            }
            try db.create(index: "idx_sync_queue_entity", on: "sync_queue", columns: ["entity"])
            try db.create(index: "idx_sync_queue_created_at", on: "sync_queue", columns: ["created_at"])
        }

        try m.migrate(writer)
    }
}
