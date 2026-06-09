//
//  RouteDirectionTests.swift
//  WaypointiOSTests
//
//  Port of web/lib/domain/__tests__/routeDirection coverage.
//

import Testing
@testable import WaypointiOS

@Suite("routeDirection")
struct RouteDirectionTests {

    @Test func parsesArrowTitle() {
        let d = routeDirectionFromLine(nil, title: "Den 3: Tatry → Štrbské pleso")
        #expect(d?.start == "Tatry")
        #expect(d?.destination == "Štrbské pleso")
        #expect(d?.label == "Tatry → Štrbské pleso")
    }

    @Test func parsesDashAndDoSeparators() {
        #expect(routeDirectionFromLine(nil, title: "Chata - Vrchol")?.label == "Chata → Vrchol")
        #expect(routeDirectionFromLine(nil, title: "Praha do Brna")?.label == "Praha → Brna")
    }

    @Test func fallsBackToCoordinatesWhenNoNames() {
        let line = LineString(coordinates: [[14.0, 50.0], [15.0, 49.0]])
        let d = routeDirectionFromLine(line, title: "Den 1")
        #expect(d?.start == "50.0000, 14.0000")
        #expect(d?.destination == "49.0000, 15.0000")
        #expect(isCoordinateLabel(d!.start))
    }

    @Test func nilWhenNoTitleAndNoLine() {
        #expect(routeDirectionFromLine(nil, title: "Den 1") == nil)
    }

    @Test func upgradeReplacesOnlyCoordinateParts() {
        let d = RouteDirection(start: "50.0000, 14.0000", destination: "Brno", label: "x")
        let up = d.upgrading(start: "Praha", destination: "Olomouc")
        #expect(up.start == "Praha")        // was a coordinate → replaced
        #expect(up.destination == "Brno")   // already a name → kept
    }
}
