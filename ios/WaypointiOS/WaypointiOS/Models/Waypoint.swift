import Foundation
import GRDB

struct Waypoint: Identifiable, Sendable {
    var id: String
    var trailId: String
    var userId: String
    var name: String
    var type: String
    var latitude: Double
    var longitude: Double
    var elevationM: Int?
    var distanceAlongRouteKm: Double?
    var description: String?
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?
    var dirty: Bool
}

extension Waypoint: Codable, FetchableRecord, MutablePersistableRecord {
    static let databaseTableName = "waypoints"
    static var databaseDateDecodingStrategy: DatabaseDateDecodingStrategy { .timeIntervalSince1970 }
    static var databaseDateEncodingStrategy: DatabaseDateEncodingStrategy { .timeIntervalSince1970 }

    enum CodingKeys: String, CodingKey {
        case id, name, type, latitude, longitude, description
        case trailId = "trail_id"
        case userId = "user_id"
        case elevationM = "elevation_m"
        case distanceAlongRouteKm = "distance_along_route_km"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
        case dirty = "_dirty"
    }
}
