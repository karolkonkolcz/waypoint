import Foundation
import GRDB

// GRDB record — primary read source per IOS_STRATEGY.md §I9.
// Columns stay snake_case (= Postgres names) so the same row round-trips via sync.
// Dates stored as Unix timestamp (Double) in SQLite; DateFormatter handles
// the ISO8601 ↔ Date conversion on the Supabase DTO side (see SyncEngine).

struct Trail: Identifiable, Sendable {
    var id: String
    var userId: String
    var name: String
    var description: String?
    var startDate: String?          // DATE column → keep as "YYYY-MM-DD" string
    var defaultPaceKmh: Double
    var preferences: String         // jsonb stored as raw JSON text
    var coverImageUrl: String?
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?
    var dirty: Bool                 // LOCAL ONLY — stripped before push (Phase 3)
}

// MARK: - GRDB conformance

extension Trail: Codable, FetchableRecord, MutablePersistableRecord {
    static let databaseTableName = "trails"
    static var databaseDateDecodingStrategy: DatabaseDateDecodingStrategy { .timeIntervalSince1970 }
    static var databaseDateEncodingStrategy: DatabaseDateEncodingStrategy { .timeIntervalSince1970 }

    enum CodingKeys: String, CodingKey {
        case id, name, description
        case userId = "user_id"
        case startDate = "start_date"
        case defaultPaceKmh = "default_pace_kmh"
        case preferences
        case coverImageUrl = "cover_image_url"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
        case dirty = "_dirty"
    }
}
