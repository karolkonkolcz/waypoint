import Foundation
import GRDB

// GRDB record for stages. Mirrors Postgres schema snake_case columns exactly.
// `timeline` (jsonb) is stored as raw JSON text; decoded from GRDB only,
// never written from the Supabase DTO in Phase 2.

struct Stage: Identifiable, Sendable {
    var id: String
    var trailId: String
    var userId: String
    var title: String
    var orderIndex: Int
    var stageType: String           // "trek" | "transit"
    var distanceKm: Double
    var ascentM: Double
    var descentM: Double
    var difficultyScore: Int?
    var difficultyClass: String?
    var date: String?               // nullable DATE override "YYYY-MM-DD"
    var startDistanceKm: Double?
    var endDistanceKm: Double?
    var locationName: String?
    var locationLat: Double?
    var locationLon: Double?
    var notes: String?
    var timeline: String?           // jsonb stored as text; nil until Phase 3 writes it
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?
    var dirty: Bool
}

// MARK: - GRDB conformance

extension Stage: Codable, FetchableRecord, MutablePersistableRecord {
    static let databaseTableName = "stages"
    static var databaseDateDecodingStrategy: DatabaseDateDecodingStrategy { .timeIntervalSince1970 }
    static var databaseDateEncodingStrategy: DatabaseDateEncodingStrategy { .timeIntervalSince1970 }

    enum CodingKeys: String, CodingKey {
        case id, title, notes, timeline
        case trailId = "trail_id"
        case userId = "user_id"
        case orderIndex = "order_index"
        case stageType = "stage_type"
        case distanceKm = "distance_km"
        case ascentM = "ascent_m"
        case descentM = "descent_m"
        case difficultyScore = "difficulty_score"
        case difficultyClass = "difficulty_class"
        case date
        case startDistanceKm = "start_distance_km"
        case endDistanceKm = "end_distance_km"
        case locationName = "location_name"
        case locationLat = "location_lat"
        case locationLon = "location_lon"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
        case dirty = "_dirty"
    }
}

// MARK: - Domain helpers (same as Phase 1)

extension Stage {
    func computedDifficulty(paceKmh: Double) -> DifficultyResult {
        scoreDifficulty(DifficultyInput(distanceKm: distanceKm, ascentM: ascentM, descentM: descentM))
    }

    func computedETA(paceKmh: Double, startTime: Date) -> ETAResult {
        computeETA(distanceKm: distanceKm, ascentM: ascentM, paceKmh: paceKmh, startTime: startTime)
    }
}
