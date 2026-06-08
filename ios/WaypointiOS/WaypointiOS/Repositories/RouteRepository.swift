import Foundation
import GRDB

struct RouteRepository {
    private let db: AppDatabase

    init(db: AppDatabase = .shared) {
        self.db = db
    }

    struct CreateInput: Sendable {
        var trailId: String
        var stageId: String?
        var userId: String
        var geojson: String
        var totalDistanceKm: Double
        var totalAscentM: Int
        var totalDescentM: Int
        var elevationProfile: String
        var source: String

        init(
            trailId: String,
            stageId: String? = nil,
            userId: String,
            geojson: String,
            totalDistanceKm: Double,
            totalAscentM: Int,
            totalDescentM: Int,
            elevationProfile: String = "[]",
            source: String = "gpx"
        ) {
            self.trailId = trailId
            self.stageId = stageId
            self.userId = userId
            self.geojson = geojson
            self.totalDistanceKm = totalDistanceKm
            self.totalAscentM = totalAscentM
            self.totalDescentM = totalDescentM
            self.elevationProfile = elevationProfile
            self.source = source
        }
    }

    func observeByTrail(trailId: String) -> AsyncStream<[Route]> {
        AsyncStream { continuation in
            let observation = ValueObservation.tracking { db in
                try Route
                    .filter(Column("trail_id") == trailId && Column("deleted_at") == nil)
                    .order(Column("stage_id").asc)
                    .fetchAll(db)
            }
            let cancellable = observation.start(
                in: db.dbPool,
                onError: { _ in continuation.finish() },
                onChange: { routes in continuation.yield(routes) }
            )
            continuation.onTermination = { _ in cancellable.cancel() }
        }
    }

    func findByStage(stageId: String) throws -> Route? {
        try db.dbPool.read { db in
            try Route
                .filter(Column("stage_id") == stageId && Column("deleted_at") == nil)
                .fetchOne(db)
        }
    }

    func upsert(_ input: CreateInput) throws -> Route {
        let now = Date()
        return try db.dbPool.write { db in
            let existing: Route?
            if let stageId = input.stageId {
                existing = try Route
                    .filter(Column("stage_id") == stageId && Column("deleted_at") == nil)
                    .fetchOne(db)
            } else {
                existing = try Route
                    .filter(
                        Column("trail_id") == input.trailId
                            && Column("stage_id") == nil
                            && Column("deleted_at") == nil
                    )
                    .fetchOne(db)
            }

            var row = Route(
                id: existing?.id ?? newUUIDv7(),
                trailId: input.trailId,
                stageId: input.stageId,
                userId: input.userId,
                geojson: input.geojson,
                totalDistanceKm: input.totalDistanceKm,
                totalAscentM: input.totalAscentM,
                totalDescentM: input.totalDescentM,
                elevationProfile: input.elevationProfile,
                source: input.source,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                deletedAt: nil,
                dirty: true
            )
            try row.upsert(db)
            try enqueueSyncOp(db, entity: Route.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
            return row
        }
    }

    func bulkCreate(_ inputs: [CreateInput]) throws -> [Route] {
        let now = Date()
        var rows = inputs.map {
            Route(
                id: newUUIDv7(),
                trailId: $0.trailId,
                stageId: $0.stageId,
                userId: $0.userId,
                geojson: $0.geojson,
                totalDistanceKm: $0.totalDistanceKm,
                totalAscentM: $0.totalAscentM,
                totalDescentM: $0.totalDescentM,
                elevationProfile: $0.elevationProfile,
                source: $0.source,
                createdAt: now,
                updatedAt: now,
                deletedAt: nil,
                dirty: true
            )
        }
        try db.dbPool.write { db in
            for index in rows.indices {
                try rows[index].insert(db)
                try enqueueSyncOp(
                    db,
                    entity: Route.databaseTableName,
                    op: .upsert,
                    rowId: rows[index].id,
                    createdAt: now
                )
            }
        }
        return rows
    }

    func removeByStage(stageId: String) throws {
        let now = Date()
        try db.dbPool.write { db in
            guard var row = try Route
                .filter(Column("stage_id") == stageId && Column("deleted_at") == nil)
                .fetchOne(db) else { return }
            row.deletedAt = now
            row.updatedAt = now
            row.dirty = true
            try row.upsert(db)
            try enqueueSyncOp(db, entity: Route.databaseTableName, op: .delete, rowId: row.id, createdAt: now)
        }
    }
}
