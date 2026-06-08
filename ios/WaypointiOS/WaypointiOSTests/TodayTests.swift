import Foundation
import Testing
@testable import WaypointiOS

@Suite("Today")
struct TodayTests {
    @Test func resolvesTrailCoveringToday() {
        let old = trail(id: "old", startDate: "2026-05-01")
        let live = trail(id: "live", startDate: "2026-06-07")

        let active = resolveActiveTrail(
            trails: [old, live],
            stageCountByTrail: ["old": 2, "live": 3],
            today: "2026-06-08"
        )

        #expect(active?.id == "live")
    }

    @Test func fallsBackToNewestTrailWhenNoneIsLive() {
        let newest = trail(id: "newest", startDate: "2026-05-01")
        let active = resolveActiveTrail(trails: [newest], stageCountByTrail: ["newest": 1], today: "2026-06-08")

        #expect(active?.id == "newest")
    }

    @Test func buildsTrekSummaryWithWeather() {
        var stage = Stage(
            id: "stage-1",
            trailId: "trail-1",
            userId: "user-1",
            title: "Day 1",
            orderIndex: 0,
            stageType: "trek",
            distanceKm: 18,
            ascentM: 700,
            descentM: 200,
            difficultyScore: 50,
            difficultyClass: "moderate",
            date: nil,
            startDistanceKm: nil,
            endDistanceKm: nil,
            locationName: nil,
            locationLat: nil,
            locationLon: nil,
            notes: nil,
            timeline: nil,
            createdAt: Date(),
            updatedAt: Date(),
            deletedAt: nil,
            dirty: false
        )
        stage.difficultyClass = "moderate"

        let snapshot = WeatherSnapshot(
            date: "2026-06-08",
            latitude: 50,
            longitude: 14,
            entries: [],
            precipTotalMm: 0,
            windMaxKmh: 10,
            moving: [],
            startHour: nil,
            arrivalHour: nil,
            rainStartsHour: nil,
            rainStartsKm: nil
        )

        let summary = buildDaySummary(stage: stage, snapshot: snapshot)

        #expect(summary.contains("středně náročný"))
        #expect(summary.contains("po celý den sucho"))
    }

    private func trail(id: String, startDate: String) -> Trail {
        Trail(
            id: id,
            userId: "user-1",
            name: id,
            description: nil,
            startDate: startDate,
            defaultPaceKmh: 4,
            preferences: "{}",
            coverImageUrl: nil,
            createdAt: Date(),
            updatedAt: Date(),
            deletedAt: nil,
            dirty: false
        )
    }
}
