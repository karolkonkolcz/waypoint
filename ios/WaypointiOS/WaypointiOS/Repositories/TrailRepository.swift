import Foundation
import GRDB

// Read-only repository for trails. All queries go to GRDB — never Supabase.
// ValueObservation is bridged to AsyncStream so ViewModels can use `for await`.
// See IOS_STRATEGY.md §I9.

struct TrailRepository {
    private let db: AppDatabase

    init(db: AppDatabase = .shared) {
        self.db = db
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

    // One-shot fetch — used by SyncEngine to get owned trail IDs.
    func allIds(userId: String) throws -> [String] {
        try db.dbPool.read { db in
            try String.fetchAll(
                db,
                sql: "SELECT id FROM trails WHERE user_id = ?",
                arguments: [userId]
            )
        }
    }
}
