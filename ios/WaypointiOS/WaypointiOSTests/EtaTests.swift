//
//  EtaTests.swift
//  WaypointiOSTests
//
//  Port of web/lib/domain/__tests__/eta.test.ts.
//

import Foundation
import Testing
@testable import WaypointiOS

@Suite("naismithHours")
struct NaismithTests {

    @Test func flatTerrainIsDistanceOverPace() {
        #expect(abs(naismithHours(distanceKm: 20, ascentM: 0, paceKmh: 4) - 5.0) < 0.01)
    }

    @Test func pureClimb600mIsOneHour() {
        #expect(abs(naismithHours(distanceKm: 0, ascentM: 600, paceKmh: 4) - 1.0) < 0.01)
    }

    @Test func flatPlusClimbCombined() {
        // 20 km @ 4 kmh = 5 h + 600 m / 600 mh = 1 h → 6 h
        #expect(abs(naismithHours(distanceKm: 20, ascentM: 600, paceKmh: 4) - 6.0) < 0.01)
    }

    @Test func fasterPaceReducesTime() {
        let slow = naismithHours(distanceKm: 20, ascentM: 500, paceKmh: 3)
        let fast = naismithHours(distanceKm: 20, ascentM: 500, paceKmh: 5)
        #expect(fast < slow)
    }
}

@Suite("computeETA")
struct ComputeETATests {

    @Test func arrivalIsAfterStart() {
        let start = Date(timeIntervalSince1970: 1751346000) // 2025-07-01 07:00 UTC
        let result = computeETA(distanceKm: 20, ascentM: 600, paceKmh: 4, startTime: start)
        #expect(result.arrivalTime > start)
        #expect(abs(result.totalHours - naismithHours(distanceKm: 20, ascentM: 600, paceKmh: 4)) < 1e-10)
    }

    @Test func arrivalOffsetMatchesTotalHours() {
        let start = Date(timeIntervalSince1970: 1751346000)
        let result = computeETA(distanceKm: 15, ascentM: 400, paceKmh: 4, startTime: start)
        let diffH = result.arrivalTime.timeIntervalSince(start) / 3600
        #expect(abs(diffH - result.totalHours) < 1e-10)
    }
}
