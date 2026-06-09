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
}
