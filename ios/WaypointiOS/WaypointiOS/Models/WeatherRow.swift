import Foundation
import GRDB

struct WeatherRow: Identifiable, Sendable {
    var id: String
    var trailId: String
    var stageId: String?
    var userId: String
    var latitude: Double
    var longitude: Double
    var forecastJson: String
    var validFrom: Date?
    var validTo: Date?
    var fetchedAt: Date
}

extension WeatherRow: Codable, FetchableRecord, MutablePersistableRecord {
    static let databaseTableName = "weather"
    static var databaseDateDecodingStrategy: DatabaseDateDecodingStrategy { .timeIntervalSince1970 }
    static var databaseDateEncodingStrategy: DatabaseDateEncodingStrategy { .timeIntervalSince1970 }

    enum CodingKeys: String, CodingKey {
        case id
        case trailId = "trail_id"
        case stageId = "stage_id"
        case userId = "user_id"
        case latitude
        case longitude
        case forecastJson = "forecast_json"
        case validFrom = "valid_from"
        case validTo = "valid_to"
        case fetchedAt = "fetched_at"
    }
}
