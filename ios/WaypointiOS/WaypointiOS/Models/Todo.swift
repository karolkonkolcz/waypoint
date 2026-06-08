import Foundation
import GRDB

struct Todo: Identifiable, Sendable {
    var id: String
    var userId: String
    var trailId: String
    var stageId: String?
    var date: String?
    var text: String
    var done: Bool
    var orderIndex: Int
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?
    var dirty: Bool
}

extension Todo: Codable, FetchableRecord, MutablePersistableRecord {
    static let databaseTableName = "todos"
    static var databaseDateDecodingStrategy: DatabaseDateDecodingStrategy { .timeIntervalSince1970 }
    static var databaseDateEncodingStrategy: DatabaseDateEncodingStrategy { .timeIntervalSince1970 }

    enum CodingKeys: String, CodingKey {
        case id, date, text, done
        case userId = "user_id"
        case trailId = "trail_id"
        case stageId = "stage_id"
        case orderIndex = "order_index"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
        case dirty = "_dirty"
    }
}
