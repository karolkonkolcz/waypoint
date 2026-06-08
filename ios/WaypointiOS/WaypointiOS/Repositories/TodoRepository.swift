import Foundation
import GRDB

struct TodoRepository {
    private let db: AppDatabase

    init(db: AppDatabase = .shared) {
        self.db = db
    }

    func observeByTrail(trailId: String) -> AsyncStream<[Todo]> {
        AsyncStream { continuation in
            let observation = ValueObservation.tracking { db in
                try Todo
                    .filter(Column("trail_id") == trailId && Column("deleted_at") == nil)
                    .order(Column("done").asc, Column("order_index").asc)
                    .fetchAll(db)
            }
            let cancellable = observation.start(
                in: db.dbPool,
                onError: { _ in continuation.finish() },
                onChange: { todos in continuation.yield(todos) }
            )
            continuation.onTermination = { _ in cancellable.cancel() }
        }
    }
}
