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

@Suite("nearestPointOnRoute")
struct NearestPointOnRouteTests {

    @Test func nilForDegenerateLine() {
        let single = LineString(coordinates: [[0, 0]])
        #expect(nearestPointOnRoute(single, to: (0, 0)) == nil)
    }

    @Test func pointOnRouteHasZeroOffset() {
        // Midpoint of the first segment, exactly on the line.
        let proj = nearestPointOnRoute(line, to: (0.5, 0))
        #expect(proj != nil)
        #expect(proj!.offRouteKm < 1e-6)
        #expect(abs(proj!.km - haversineKm((0, 0), (0.5, 0))) < 0.1)
    }

    @Test func kmAccumulatesAcrossSegments() {
        // Just past the middle vertex → ~one full degree along the route.
        let proj = nearestPointOnRoute(line, to: (1, 0.0005))
        #expect(proj != nil)
        #expect(abs(proj!.km - haversineKm((0, 0), (1, 0))) < 0.5)
    }

    @Test func offRouteReportsPerpendicularDistance() {
        // ~0.01° north of the line at lon 1 → a few hundred metres off-route,
        // but still snapped to km ≈ one degree along.
        let proj = nearestPointOnRoute(line, to: (1, 0.01))
        #expect(proj != nil)
        #expect(proj!.offRouteKm > 0.5)
        #expect(abs(proj!.km - haversineKm((0, 0), (1, 0))) < 0.5)
    }

    @Test func clampsBeyondEndToFinalVertex() {
        let proj = nearestPointOnRoute(line, to: (3, 0))
        #expect(proj != nil)
        #expect(abs(proj!.point.lon - 2) < 1e-6)
        #expect(abs(proj!.km - totalDistance(line)) < 0.1)
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
