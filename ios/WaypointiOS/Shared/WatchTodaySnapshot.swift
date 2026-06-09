import Foundation

struct WatchTodaySnapshot: Codable, Equatable, Sendable {
    var generatedAt: Date
    var isAvailable: Bool
    var title: String
    var subtitle: String
    var trailName: String?
    var stageType: String?
    var distanceKm: Double?
    var ascentM: Double?
    var descentM: Double?
    var etaMinutes: Int?
    var difficultyLabel: String?
    var summary: String?
    var weatherCondition: String?
    var temperatureC: Int?
    var precipTotalMm: Double?
    var rainStartsHour: Int?
    var openTodoCount: Int
    var todoTitles: [String]
    var routeProfile: [WatchRouteProfilePoint]? = nil
    var timelineItems: [WatchRouteTimelineItem]? = nil

    static func unavailable(title: String, subtitle: String) -> WatchTodaySnapshot {
        WatchTodaySnapshot(
            generatedAt: Date(),
            isAvailable: false,
            title: title,
            subtitle: subtitle,
            trailName: nil,
            stageType: nil,
            distanceKm: nil,
            ascentM: nil,
            descentM: nil,
            etaMinutes: nil,
            difficultyLabel: nil,
            summary: nil,
            weatherCondition: nil,
            temperatureC: nil,
            precipTotalMm: nil,
            rainStartsHour: nil,
            openTodoCount: 0,
            todoTitles: [],
            routeProfile: [],
            timelineItems: []
        )
    }
}

struct WatchRouteProfilePoint: Codable, Equatable, Sendable {
    var distanceKm: Double
    var elevationM: Int
}

struct WatchRouteTimelineItem: Codable, Equatable, Sendable {
    var hour: Double
    var title: String
    var detail: String?
    var distanceKm: Double
    var elevationM: Int?
    var isWeather: Bool
}
