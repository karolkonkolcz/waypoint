import Foundation
import GRDB

// Local-first repository for stages. Reads and writes go to GRDB — never
// Supabase directly. Writes mark rows dirty and enqueue sync ops.

struct StageRepository {
    private let db: AppDatabase

    init(db: AppDatabase = .shared) {
        self.db = db
    }

    struct CreateInput: Sendable {
        var trailId: String
        var userId: String
        var title: String
        var orderIndex: Int
        var stageType: String
        var date: String?
        var distanceKm: Double
        var ascentM: Double
        var descentM: Double
        var startDistanceKm: Double?
        var endDistanceKm: Double?
        var locationName: String?
        var locationLat: Double?
        var locationLon: Double?
        var notes: String?
        var timeline: String

        init(
            trailId: String,
            userId: String,
            title: String,
            orderIndex: Int,
            stageType: String = "trek",
            date: String? = nil,
            distanceKm: Double = 0,
            ascentM: Double = 0,
            descentM: Double = 0,
            startDistanceKm: Double? = nil,
            endDistanceKm: Double? = nil,
            locationName: String? = nil,
            locationLat: Double? = nil,
            locationLon: Double? = nil,
            notes: String? = nil,
            timeline: String = "[]"
        ) {
            self.trailId = trailId
            self.userId = userId
            self.title = title
            self.orderIndex = orderIndex
            self.stageType = stageType
            self.date = date
            self.distanceKm = distanceKm
            self.ascentM = ascentM
            self.descentM = descentM
            self.startDistanceKm = startDistanceKm
            self.endDistanceKm = endDistanceKm
            self.locationName = locationName
            self.locationLat = locationLat
            self.locationLon = locationLon
            self.notes = notes
            self.timeline = timeline
        }
    }

    // Live-updating stream of non-deleted stages for a trail, ordered by day.
    func observeByTrail(trailId: String) -> AsyncStream<[Stage]> {
        AsyncStream { continuation in
            let observation = ValueObservation.tracking { db in
                try Stage
                    .filter(Column("trail_id") == trailId && Column("deleted_at") == nil)
                    .order(Column("order_index").asc)
                    .fetchAll(db)
            }
            let cancellable = observation.start(
                in: db.dbPool,
                onError: { _ in continuation.finish() },
                onChange: { stages in continuation.yield(stages) }
            )
            continuation.onTermination = { _ in cancellable.cancel() }
        }
    }

    func create(_ input: CreateInput) throws -> Stage {
        let now = Date()
        var row = makeStage(input, id: newUUIDv7(), createdAt: now, updatedAt: now)
        row.dirty = true

        try db.dbPool.write { db in
            try row.insert(db)
            try enqueueSyncOp(db, entity: Stage.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
        }
        return row
    }

    func update(id: String, mutate: (inout Stage) -> Void) throws -> Stage {
        let now = Date()
        return try db.dbPool.write { db in
            guard var row = try Stage.fetchOne(db, key: id), row.deletedAt == nil else {
                throw RepositoryError.notFound("Stage \(id) not found")
            }
            mutate(&row)
            applyDifficulty(&row)
            row.updatedAt = now
            row.dirty = true
            try row.upsert(db)
            try enqueueSyncOp(db, entity: Stage.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
            return row
        }
    }

    func remove(id: String) throws {
        let now = Date()
        try db.dbPool.write { db in
            guard var row = try Stage.fetchOne(db, key: id) else { return }

            if var route = try Route
                .filter(Column("stage_id") == id && Column("deleted_at") == nil)
                .fetchOne(db) {
                route.deletedAt = now
                route.updatedAt = now
                route.dirty = true
                try route.upsert(db)
                try enqueueSyncOp(db, entity: Route.databaseTableName, op: .delete, rowId: route.id, createdAt: now)
            }

            try db.execute(sql: "DELETE FROM weather WHERE stage_id = ?", arguments: [id])

            row.deletedAt = now
            row.updatedAt = now
            row.dirty = true
            try row.upsert(db)
            try enqueueSyncOp(db, entity: Stage.databaseTableName, op: .delete, rowId: id, createdAt: now)

            let survivors = try Stage
                .filter(Column("trail_id") == row.trailId && Column("deleted_at") == nil)
                .order(Column("order_index").asc)
                .fetchAll(db)

            for (index, survivor) in survivors.enumerated() where survivor.orderIndex != index {
                var updated = survivor
                updated.orderIndex = index
                updated.updatedAt = now
                updated.dirty = true
                try updated.upsert(db)
                try enqueueSyncOp(
                    db,
                    entity: Stage.databaseTableName,
                    op: .upsert,
                    rowId: updated.id,
                    createdAt: now
                )
            }
        }
    }

    func insertAt(_ input: CreateInput, position: Int) throws -> Stage {
        let now = Date()
        var created = makeStage(input, id: newUUIDv7(), createdAt: now, updatedAt: now)
        created.dirty = true

        try db.dbPool.write { db in
            let siblings = try Stage
                .filter(Column("trail_id") == input.trailId && Column("deleted_at") == nil)
                .order(Column("order_index").asc)
                .fetchAll(db)
            let clamped = max(0, min(position, siblings.count))
            created.orderIndex = clamped

            var ordered = siblings
            ordered.insert(created, at: clamped)

            for (index, stage) in ordered.enumerated() {
                var updated = stage
                updated.orderIndex = index
                updated.updatedAt = now
                updated.dirty = true
                try updated.upsert(db)
                try enqueueSyncOp(db, entity: Stage.databaseTableName, op: .upsert, rowId: updated.id, createdAt: now)
            }
        }

        return created
    }

    func reorder(trailId: String, orderedIds: [String]) throws {
        let now = Date()
        try db.dbPool.write { db in
            for (index, id) in orderedIds.enumerated() {
                guard var row = try Stage.fetchOne(db, key: id), row.trailId == trailId else { continue }
                row.orderIndex = index
                row.updatedAt = now
                row.dirty = true
                try row.upsert(db)
                try enqueueSyncOp(db, entity: Stage.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
            }
        }
    }

    private func makeStage(_ input: CreateInput, id: String, createdAt: Date, updatedAt: Date) -> Stage {
        let isTransit = input.stageType == "transit"
        var row = Stage(
            id: id,
            trailId: input.trailId,
            userId: input.userId,
            title: input.title,
            orderIndex: input.orderIndex,
            stageType: input.stageType,
            distanceKm: isTransit ? 0 : input.distanceKm,
            ascentM: isTransit ? 0 : input.ascentM,
            descentM: isTransit ? 0 : input.descentM,
            difficultyScore: nil,
            difficultyClass: nil,
            date: input.date,
            startDistanceKm: isTransit ? nil : input.startDistanceKm,
            endDistanceKm: isTransit ? nil : input.endDistanceKm,
            locationName: input.locationName,
            locationLat: input.locationLat,
            locationLon: input.locationLon,
            notes: input.notes,
            timeline: input.timeline,
            createdAt: createdAt,
            updatedAt: updatedAt,
            deletedAt: nil,
            dirty: false
        )
        applyDifficulty(&row)
        return row
    }

    private func applyDifficulty(_ row: inout Stage) {
        guard row.stageType != "transit" else {
            row.difficultyScore = nil
            row.difficultyClass = nil
            return
        }
        let result = scoreDifficulty(
            DifficultyInput(distanceKm: row.distanceKm, ascentM: row.ascentM, descentM: row.descentM)
        )
        row.difficultyScore = result.score
        row.difficultyClass = result.klass.rawValue
    }
}
