import Foundation
import GRDB

struct WaypointRepository {
    private let db: AppDatabase

    init(db: AppDatabase = .shared) {
        self.db = db
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
}
