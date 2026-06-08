import Foundation
import GRDB

// Read-only repository for stages. All queries go to GRDB — never Supabase.

struct StageRepository {
    private let db: AppDatabase

    init(db: AppDatabase = .shared) {
        self.db = db
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
}
