import Foundation
import GRDB

// Local-first repository for trails. Reads and writes go to GRDB — never
// Supabase directly. Writes mark rows dirty and enqueue sync ops.
// ValueObservation is bridged to AsyncStream so ViewModels can use `for await`.
// See IOS_STRATEGY.md §I9.

struct TrailRepository {
    private let db: AppDatabase

    init(db: AppDatabase = .shared) {
        self.db = db
    }

    struct CreateInput: Sendable {
        var userId: String
        var name: String
        var description: String?
        var startDate: String?
        var defaultPaceKmh: Double
        var preferences: String
        var coverImageUrl: String?

        init(
            userId: String,
            name: String,
            description: String? = nil,
            startDate: String? = nil,
            defaultPaceKmh: Double = 4.0,
            preferences: String = "{}",
            coverImageUrl: String? = nil
        ) {
            self.userId = userId
            self.name = name
            self.description = description
            self.startDate = startDate
            self.defaultPaceKmh = defaultPaceKmh
            self.preferences = preferences
            self.coverImageUrl = coverImageUrl
        }
    }

    // Live-updating stream of all non-deleted trails, newest first.
    // The stream never throws; DB errors silently end it (app keeps last state).
    func observeAll() -> AsyncStream<[Trail]> {
        AsyncStream { continuation in
            let observation = ValueObservation.tracking { db in
                try Trail
                    .filter(Column("deleted_at") == nil)
                    .order(Column("created_at").desc)
                    .fetchAll(db)
            }
            let cancellable = observation.start(
                in: db.dbPool,
                onError: { _ in continuation.finish() },
                onChange: { trails in continuation.yield(trails) }
            )
            continuation.onTermination = { _ in cancellable.cancel() }
        }
    }

    // One-shot fetch for owned trail IDs.
    func allIds(userId: String) throws -> [String] {
        try db.dbPool.read { db in
            try String.fetchAll(
                db,
                sql: "SELECT id FROM trails WHERE user_id = ?",
                arguments: [userId]
            )
        }
    }

    func create(_ input: CreateInput) throws -> Trail {
        let now = Date()
        var row = Trail(
            id: newUUIDv7(),
            userId: input.userId,
            name: input.name,
            description: input.description,
            startDate: input.startDate,
            defaultPaceKmh: input.defaultPaceKmh,
            preferences: input.preferences,
            coverImageUrl: input.coverImageUrl,
            createdAt: now,
            updatedAt: now,
            deletedAt: nil,
            dirty: true
        )

        try db.dbPool.write { db in
            try row.insert(db)
            try enqueueSyncOp(db, entity: Trail.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
        }
        return row
    }

    func update(id: String, mutate: (inout Trail) -> Void) throws -> Trail {
        let now = Date()
        return try db.dbPool.write { db in
            guard var row = try Trail.fetchOne(db, key: id), row.deletedAt == nil else {
                throw RepositoryError.notFound("Trail \(id) not found")
            }
            mutate(&row)
            row.updatedAt = now
            row.dirty = true
            try row.upsert(db)
            try enqueueSyncOp(db, entity: Trail.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
            return row
        }
    }

    func remove(id: String) throws {
        let now = Date()
        try db.dbPool.write { db in
            guard var trail = try Trail.fetchOne(db, key: id) else { return }

            let stages = try Stage
                .filter(Column("trail_id") == id && Column("deleted_at") == nil)
                .fetchAll(db)
            for var stage in stages {
                stage.deletedAt = now
                stage.updatedAt = now
                stage.dirty = true
                try stage.upsert(db)
                try enqueueSyncOp(db, entity: Stage.databaseTableName, op: .delete, rowId: stage.id, createdAt: now)
            }

            let routes = try Route
                .filter(Column("trail_id") == id && Column("deleted_at") == nil)
                .fetchAll(db)
            for var route in routes {
                route.deletedAt = now
                route.updatedAt = now
                route.dirty = true
                try route.upsert(db)
                try enqueueSyncOp(db, entity: Route.databaseTableName, op: .delete, rowId: route.id, createdAt: now)
            }

            let waypoints = try Waypoint
                .filter(Column("trail_id") == id && Column("deleted_at") == nil)
                .fetchAll(db)
            for var waypoint in waypoints {
                waypoint.deletedAt = now
                waypoint.updatedAt = now
                waypoint.dirty = true
                try waypoint.upsert(db)
                try enqueueSyncOp(
                    db,
                    entity: Waypoint.databaseTableName,
                    op: .delete,
                    rowId: waypoint.id,
                    createdAt: now
                )
            }

            try db.execute(sql: "DELETE FROM weather WHERE trail_id = ?", arguments: [id])
            try db.execute(sql: "DELETE FROM alerts WHERE trail_id = ?", arguments: [id])

            trail.deletedAt = now
            trail.updatedAt = now
            trail.dirty = true
            try trail.upsert(db)
            try enqueueSyncOp(db, entity: Trail.databaseTableName, op: .delete, rowId: trail.id, createdAt: now)
        }
    }
}

enum RepositoryError: Error, Equatable {
    case notFound(String)
}
