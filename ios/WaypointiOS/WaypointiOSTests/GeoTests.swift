//
//  GeoTests.swift
//  WaypointiOSTests
//
//  Port of web/lib/domain/__tests__/geo.test.ts.
//  Simple west-east line: 3 points ~1° apart in longitude (~111 km each).
//

import Testing
@testable import WaypointiOS

private let line = LineString(coordinates: [[0, 0], [1, 0], [2, 0]])

@Suite("haversineKm")
struct HaversineTests {

    @Test func zeroForSamePoint() {
        #expect(haversineKm((10, 50), (10, 50)) == 0)
    }

    @Test func equatorDegreeIsAbout111km() {
        #expect(abs(haversineKm((0, 0), (1, 0)) - 111.195) < 0.5)
    }
}

@Suite("totalDistance")
struct TotalDistanceTests {

    @Test func sumsSegments() {
        let seg = haversineKm((0, 0), (1, 0))
        #expect(abs(totalDistance(line) - seg * 2) < 0.1)
    }
}

@Suite("pointAtDistance")
struct PointAtDistanceTests {

    @Test func clampsToStart() {
        let p = pointAtDistance(line, 0)
        #expect(p.lon == 0 && p.lat == 0)
    }

    @Test func clampsToBeyondEnd() {
        let p = pointAtDistance(line, 9999)
        #expect(abs(p.lon - 2) < 1e-5)
    }

    @Test func midpointAtHalfDistance() {
        let half = totalDistance(line) / 2
        let p = pointAtDistance(line, half)
        #expect(abs(p.lon - 1) < 0.1)
        #expect(abs(p.lat - 0) < 1e-5)
    }
}

@Suite("sliceLineString")
struct SliceTests {

    @Test func fullSliceTotalEqualsOriginal() {
        let total = totalDistance(line)
        let sliced = sliceLineString(line, from: 0, to: total)
        #expect(abs(totalDistance(sliced) - total) < 0.1)
    }

    @Test func halfSliceIsShorter() {
        let total = totalDistance(line)
        let sliced = sliceLineString(line, from: 0, to: total / 2)
        #expect(totalDistance(sliced) < total)
    }
}

@Suite("samplePoints")
struct SamplePointsTests {

    @Test func returnsNPoints() {
        #expect(samplePoints(line, n: 5).count == 5)
    }

    @Test func firstPointIsStart() {
        let pts = samplePoints(line, n: 3)
        #expect(pts[0].lon == 0 && pts[0].lat == 0)
    }

    @Test func lastPointIsEnd() {
        let pts = samplePoints(line, n: 3)
        #expect(abs(pts.last!.lon - 2) < 0.1)
    }
}
