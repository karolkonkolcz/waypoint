import Foundation

/// Lightweight snapshot of the whole active trail, pushed to the watch so it can
/// browse every stage offline (list + schematic map + profile). Polylines are
/// aggressively downsampled on the phone — this is for glanceable shape, not
/// navigation.
struct WatchTrailOverview: Codable, Equatable, Sendable {
    var generatedAt: Date
    var trailName: String
    var stages: [WatchStageSummary]

    static func empty(trailName: String = "") -> WatchTrailOverview {
        WatchTrailOverview(generatedAt: Date(), trailName: trailName, stages: [])
    }
}

struct WatchStageSummary: Codable, Equatable, Sendable, Identifiable {
    var id: String
    /// Trek-day number (1-based). `nil` for transit stages.
    var dayNumber: Int?
    var title: String
    var dateLabel: String?
    var stageType: String
    var isToday: Bool
    var distanceKm: Double
    var ascentM: Double
    var descentM: Double
    var etaMinutes: Int?
    var difficultyLabel: String?
    var difficultyClass: String?
    /// `[lon, lat]` pairs, downsampled. Empty when the stage has no route.
    var routePolyline: [[Double]]
    var routeProfile: [WatchRouteProfilePoint]

    var isTransit: Bool { stageType == "transit" }
}
