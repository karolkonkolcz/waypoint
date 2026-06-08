import Foundation
import GRDB

struct TodoRepository {
    private let db: AppDatabase

    init(db: AppDatabase = .shared) {
        self.db = db
    }

    struct CreateInput: Sendable {
        var userId: String
        var trailId: String
        var stageId: String?
        var date: String?
        var text: String
        var orderIndex: Int?

        init(
            userId: String,
            trailId: String,
            text: String,
            stageId: String? = nil,
            date: String? = nil,
            orderIndex: Int? = nil
        ) {
            self.userId = userId
            self.trailId = trailId
            self.stageId = stageId
            self.date = date
            self.text = text
            self.orderIndex = orderIndex
        }
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

    func findByTrail(trailId: String) throws -> [Todo] {
        try db.dbPool.read { db in
            try Todo
                .filter(Column("trail_id") == trailId && Column("deleted_at") == nil)
                .order(Column("done").asc, Column("order_index").asc)
                .fetchAll(db)
        }
    }

    func add(_ input: CreateInput) throws -> Todo {
        let now = Date()
        return try db.dbPool.write { db in
            let orderIndex: Int
            if let explicit = input.orderIndex {
                orderIndex = explicit
            } else {
                orderIndex = try Todo
                    .filter(Column("trail_id") == input.trailId && Column("deleted_at") == nil)
                    .fetchCount(db)
            }

            var row = Todo(
                id: newUUIDv7(),
                userId: input.userId,
                trailId: input.trailId,
                stageId: input.stageId,
                date: input.date,
                text: input.text,
                done: false,
                orderIndex: orderIndex,
                createdAt: now,
                updatedAt: now,
                deletedAt: nil,
                dirty: true
            )
            try row.insert(db)
            try enqueueSyncOp(db, entity: Todo.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
            return row
        }
    }

    func update(id: String, mutate: (inout Todo) -> Void) throws -> Todo {
        let now = Date()
        return try db.dbPool.write { db in
            guard var row = try Todo.fetchOne(db, key: id), row.deletedAt == nil else {
                throw RepositoryError.notFound("Todo \(id) not found")
            }
            mutate(&row)
            row.updatedAt = now
            row.dirty = true
            try row.upsert(db)
            try enqueueSyncOp(db, entity: Todo.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
            return row
        }
    }

    func toggle(id: String) throws -> Todo {
        try update(id: id) { todo in
            todo.done.toggle()
        }
    }

    func remove(id: String) throws {
        let now = Date()
        try db.dbPool.write { db in
            guard var row = try Todo.fetchOne(db, key: id) else { return }
            row.deletedAt = now
            row.updatedAt = now
            row.dirty = true
            try row.upsert(db)
            try enqueueSyncOp(db, entity: Todo.databaseTableName, op: .delete, rowId: row.id, createdAt: now)
        }
    }

    func reorder(trailId: String, orderedIds: [String]) throws {
        let now = Date()
        try db.dbPool.write { db in
            for (index, id) in orderedIds.enumerated() {
                guard var row = try Todo.fetchOne(db, key: id), row.trailId == trailId else { continue }
                row.orderIndex = index
                row.updatedAt = now
                row.dirty = true
                try row.upsert(db)
                try enqueueSyncOp(db, entity: Todo.databaseTableName, op: .upsert, rowId: row.id, createdAt: now)
            }
        }
    }
}
