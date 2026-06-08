import Foundation
import GRDB

struct RouteRepository {
    private let db: AppDatabase

    init(db: AppDatabase = .shared) {
        self.db = db
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
}
