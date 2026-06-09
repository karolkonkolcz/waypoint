import Foundation
import GRDB

struct WaypointRepository {
    private let db: AppDatabase

    init(db: AppDatabase = .shared) {
        self.db = db
    }

    struct CreateInput: Sendable {
        var trailId: String
        var userId: String
        var name: String
        var type: String
        var latitude: Double
        var longitude: Double
        var elevationM: Int?
        var distanceAlongRouteKm: Double?
        var description: String?
    }

    func observeByTrail(trailId: String) -> AsyncStream<[Waypoint]> {
        AsyncStream { continuation in
            let observation = ValueObservation.tracking { db in
                try Waypoint
                    .filter(Column("trail_id") == trailId && Column("deleted_at") == nil)
                    .order(Column("distance_along_route_km").asc)
                    .fetchAll(db)
            }
            let cancellable = observation.start(
                in: db.dbPool,
                onError: { _ in continuation.finish() },
                onChange: { waypoints in continuation.yield(waypoints) }
            )
            continuation.onTermination = { _ in cancellable.cancel() }
        }
    }

    func findByTrail(trailId: String) throws -> [Waypoint] {
        try db.dbPool.read { db in
            try Waypoint
                .filter(Column("trail_id") == trailId && Column("deleted_at") == nil)
                .order(Column("distance_along_route_km").asc)
                .fetchAll(db)
        }
    }

    func create(_ input: CreateInput) throws -> Waypoint {
        let now = Date()
        var row = Waypoint(
            id: newUUIDv7(),
            trailId: input.trailId,
            userId: input.userId,
            name: input.name,
            type: input.type,
            latitude: input.latitude,
            longitude: input.longitude,
            elevationM: input.elevationM,
            distanceAlongRouteKm: input.distanceAlongRouteKm,
            description: input.description,
            createdAt: now,
            updatedAt: now,
            deletedAt: nil,
            dirty: true
        )
        try db.dbPool.write { db in
            try row.insert(db)
            try enqueueSyncOp(db, entity: Waypoint.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
        }
        return row
    }

    func update(id: String, mutate: (inout Waypoint) -> Void) throws -> Waypoint {
        let now = Date()
        return try db.dbPool.write { db in
            guard var row = try Waypoint.fetchOne(db, key: id), row.deletedAt == nil else {
                throw RepositoryError.notFound("Waypoint \(id) not found")
            }
            mutate(&row)
            row.updatedAt = now
            row.dirty = true
            try row.upsert(db)
            try enqueueSyncOp(db, entity: Waypoint.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
            return row
        }
    }

    func remove(id: String) throws {
        let now = Date()
        try db.dbPool.write { db in
            guard var row = try Waypoint.fetchOne(db, key: id) else { return }
            row.deletedAt = now
            row.updatedAt = now
            row.dirty = true
            try row.upsert(db)
            try enqueueSyncOp(db, entity: Waypoint.databaseTableName, op: .delete, rowId: row.id, createdAt: now)
        }
    }
}
