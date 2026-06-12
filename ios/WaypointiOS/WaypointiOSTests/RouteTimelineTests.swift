//
//  RouteTimelineTests.swift
//  WaypointiOSTests
//
//  Port of web/lib/domain/__tests__/routeTimeline coverage.
//

import Foundation
import Testing
@testable import WaypointiOS

@Suite("routeTimeline")
struct RouteTimelineTests {

    private let profile = [
        ElevationPoint(dKm: 0, eleM: 1000),
        ElevationPoint(dKm: 5, eleM: 1600),
        ElevationPoint(dKm: 10, eleM: 1200),
    ]

    @Test func elevationInterpolatesAndClamps() {
        #expect(elevationAtDistance(profile, -1) == 1000)
        #expect(elevationAtDistance(profile, 2.5) == 1300)
        #expect(elevationAtDistance(profile, 99) == 1200)
    }

    @Test func buildsStartPeakFinish() {
        let timeline = buildRouteTimeline(
            profile: profile, waypoints: [], paceKmh: 4, startHour: 8,
            startName: "Start", destinationName: "Cíl", snapshot: nil
        )
        let kinds = timeline.rows.map(\.kind)
        #expect(kinds.first == .start)
        #expect(kinds.last == .finish)
        #expect(kinds.contains(.peak))             // highest point at 5 km
        #expect(timeline.rows.first?.hour == 8)
        #expect(timeline.arrivalHour > 8)
    }

    @Test func emptyForFlatOrShortProfile() {
        let timeline = buildRouteTimeline(
            profile: [ElevationPoint(dKm: 0, eleM: 100)], waypoints: [], paceKmh: 4,
            startHour: 8, startName: "A", destinationName: "B", snapshot: nil
        )
        #expect(timeline.rows.isEmpty)
        #expect(timeline.arrivalHour == 8)
    }

    private func moving(_ samples: [(hour: Int, km: Double, precip: Double)]) -> WeatherSnapshot {
        WeatherSnapshot(
            date: "2026-06-12", latitude: 0, longitude: 0, entries: [],
            precipTotalMm: 0, windMaxKmh: 0,
            moving: samples.map {
                MovingWeatherEntry(
                    hour: $0.hour, km: $0.km, lat: 0, lon: 0, tempC: 10,
                    precipMm: $0.precip, windKmh: 0, condition: .rain, phase: .moving
                )
            }
        )
    }

    @Test func rainBandSpansWetRunWithInterpolatedEdges() throws {
        // Dry at 2 km, wet from 4–8 km (peak at 6 km), dry again at 10 km.
        let snapshot = moving([
            (8, 0, 0), (9, 2, 0), (10, 4, 1.0), (11, 6, 2.4), (12, 8, 0.8), (13, 10, 0),
        ])
        let b = try #require(rainBandFromSnapshot(snapshot, profile: profile))
        #expect(b.peakKm == 6)              // heaviest precip
        #expect(b.startKm > 2 && b.startKm < 4) // threshold crossing between dry/wet
        #expect(b.endKm > 8 && b.endKm < 10)
        #expect(b.startHour > 9 && b.startHour < 11)
    }

    @Test func rainBandNilWhenDry() {
        let snapshot = moving([(8, 0, 0), (9, 5, 0), (10, 10, 0)])
        #expect(rainBandFromSnapshot(snapshot, profile: profile) == nil)
    }
}
