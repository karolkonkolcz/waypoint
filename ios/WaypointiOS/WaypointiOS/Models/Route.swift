import Foundation
import GRDB

struct Route: Identifiable, Sendable {
    var id: String
    var trailId: String
    var stageId: String?
    var userId: String
    var geojson: String
    var totalDistanceKm: Double
    var totalAscentM: Int
    var totalDescentM: Int
    var elevationProfile: String
    var source: String
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?
    var dirty: Bool
}

extension Route: Codable, FetchableRecord, MutablePersistableRecord {
    static let databaseTableName = "routes"
    static var databaseDateDecodingStrategy: DatabaseDateDecodingStrategy { .timeIntervalSince1970 }
    static var databaseDateEncodingStrategy: DatabaseDateEncodingStrategy { .timeIntervalSince1970 }

    enum CodingKeys: String, CodingKey {
        case id, geojson, source
        case trailId = "trail_id"
        case stageId = "stage_id"
        case userId = "user_id"
        case totalDistanceKm = "total_distance_km"
        case totalAscentM = "total_ascent_m"
        case totalDescentM = "total_descent_m"
        case elevationProfile = "elevation_profile"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
        case dirty = "_dirty"
    }
}
