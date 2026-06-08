//
//  StageDateTests.swift
//  WaypointiOSTests
//
//  Port of web/lib/domain/__tests__/stageDate.test.ts.
//

import Testing
@testable import WaypointiOS

@Suite("addDays")
struct AddDaysTests {

    @Test func addZeroIsNoOp() {
        #expect(addDays(iso: "2026-06-01", days: 0) == "2026-06-01")
    }

    @Test func add12Days() {
        #expect(addDays(iso: "2026-06-01", days: 12) == "2026-06-13")
    }

    @Test func rollsOverMonthBoundary() {
        #expect(addDays(iso: "2026-06-29", days: 3) == "2026-07-02")
    }

    @Test func rollsOverYearBoundary() {
        #expect(addDays(iso: "2026-12-31", days: 1) == "2027-01-01")
    }
}

@Suite("stageDate")
struct StageDateTests {

    @Test func explicitDateWinsOverTrailSchedule() {
        #expect(stageDate(date: "2026-07-04", orderIndex: 2, trailStartDate: "2026-06-01") == "2026-07-04")
        #expect(stageDate(date: "2026-07-04", orderIndex: 0, trailStartDate: nil) == "2026-07-04")
    }

    @Test func derivesFromTrailStartWhenNoOverride() {
        #expect(stageDate(date: nil, orderIndex: 0, trailStartDate: "2026-06-01") == "2026-06-01")
        #expect(stageDate(date: nil, orderIndex: 12, trailStartDate: "2026-06-01") == "2026-06-13")
    }

    @Test func returnsNilWhenNeitherAvailable() {
        #expect(stageDate(date: nil, orderIndex: 3, trailStartDate: nil) == nil)
    }
}

@Suite("formatStageDate")
struct FormatStageDateTests {

    @Test func formatsWithoutTimezoneDrift() {
        // 2026-06-01 is a Monday; cs-CZ: "po 1. 6."
        #expect(formatStageDate("2026-06-01") == "po 1. 6.")
    }
}
