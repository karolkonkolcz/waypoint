//
//  Geo.swift
//  WaypointiOS
//
//  Verbatim port of web/lib/domain/geo.ts.
//  Coordinates are [lon, lat(, ele?)] — index 0 = longitude.
//

import Foundation

// MARK: - Types

struct LineString: Sendable {
    /// Each element is [lon, lat] or [lon, lat, ele].
    let coordinates: [[Double]]
}

typealias Coord2 = (lon: Double, lat: Double)
typealias BBox = (west: Double, south: Double, east: Double, north: Double)

// MARK: - Helpers

private let earthRadiusKm: Double = 6371

private func toRad(_ deg: Double) -> Double { deg * .pi / 180 }

private func toCoord2(_ c: [Double]) -> Coord2 { (c[0], c[1]) }

// MARK: - API

/// Haversine distance in km between two (lon, lat) points.
func haversineKm(_ a: Coord2, _ b: Coord2) -> Double {
    let dLat = toRad(b.lat - a.lat)
    let dLon = toRad(b.lon - a.lon)
    let x = sin(dLat / 2) * sin(dLat / 2)
        + cos(toRad(a.lat)) * cos(toRad(b.lat))
        * sin(dLon / 2) * sin(dLon / 2)
    return 2 * earthRadiusKm * asin(sqrt(x))
}

/// Total length of a LineString in km.
func totalDistance(_ line: LineString) -> Double {
    let coords = line.coordinates.map(toCoord2)
    var dist = 0.0
    for i in 1 ..< coords.count {
        dist += haversineKm(coords[i - 1], coords[i])
    }
    return dist
}

/// Cumulative distances (km) per vertex. cumulative[0] = 0.
func cumulativeDistances(_ line: LineString) -> [Double] {
    let coords = line.coordinates.map(toCoord2)
    var cum: [Double] = [0]
    for i in 1 ..< coords.count {
        cum.append(cum[i - 1] + haversineKm(coords[i - 1], coords[i]))
    }
    return cum
}

/// Returns [lon, lat] at `targetKm` along the LineString (linear interpolation).
func pointAtDistance(_ line: LineString, _ targetKm: Double) -> Coord2 {
    let coords = line.coordinates.map(toCoord2)
    let cum = cumulativeDistances(line)
    let total = cum.last ?? 0

    if targetKm <= 0 { return coords[0] }
    if targetKm >= total { return coords[coords.count - 1] }

    for i in 1 ..< cum.count {
        if cum[i] >= targetKm {
            let t = (targetKm - cum[i - 1]) / (cum[i] - cum[i - 1])
            let a = coords[i - 1], b = coords[i]
            return (a.lon + t * (b.lon - a.lon), a.lat + t * (b.lat - a.lat))
        }
    }
    return coords[coords.count - 1]
}

/// Result of snapping a free point onto a route: how far along the route the
/// closest point sits (`km`), how far off the route the original point was
/// (`offRouteKm`), and the snapped coordinate itself.
struct RouteProjection: Sendable, Equatable {
    let km: Double
    let offRouteKm: Double
    let point: Coord2

    static func == (lhs: RouteProjection, rhs: RouteProjection) -> Bool {
        lhs.km == rhs.km && lhs.offRouteKm == rhs.offRouteKm
            && lhs.point.lon == rhs.point.lon && lhs.point.lat == rhs.point.lat
    }
}

/// Snaps `p` onto the LineString, returning the closest point, its distance
/// along the route, and the perpendicular (off-route) distance. Each segment is
/// projected in a local equirectangular plane (longitude scaled by cos(lat)),
/// which is accurate over the short spans involved in "where am I on the trail".
/// Returns nil for a degenerate line (< 2 vertices).
func nearestPointOnRoute(_ line: LineString, to p: Coord2) -> RouteProjection? {
    let coords = line.coordinates.map(toCoord2)
    guard coords.count >= 2 else { return nil }
    let cum = cumulativeDistances(line)
    let kx = cos(toRad(p.lat)) // longitude → planar x scaling at the query latitude

    func planar(_ c: Coord2) -> (x: Double, y: Double) { (c.lon * kx, c.lat) }
    let pp = planar(p)

    var best: RouteProjection?
    for i in 1 ..< coords.count {
        let a = coords[i - 1], b = coords[i]
        let pa = planar(a), pb = planar(b)
        let dx = pb.x - pa.x, dy = pb.y - pa.y
        let segLen2 = dx * dx + dy * dy
        let t = segLen2 <= 0 ? 0 : max(0, min(1, ((pp.x - pa.x) * dx + (pp.y - pa.y) * dy) / segLen2))
        let closest = Coord2(lon: a.lon + t * (b.lon - a.lon), lat: a.lat + t * (b.lat - a.lat))
        let off = haversineKm(p, closest)
        if best == nil || off < best!.offRouteKm {
            best = RouteProjection(
                km: cum[i - 1] + haversineKm(a, closest),
                offRouteKm: off,
                point: closest
            )
        }
    }
    return best
}

/// Sub-LineString from startKm to endKm.
func sliceLineString(_ line: LineString, from startKm: Double, to endKm: Double) -> LineString {
    let coords = line.coordinates.map(toCoord2)
    let cum = cumulativeDistances(line)
    var slice: [Coord2] = []

    slice.append(pointAtDistance(line, startKm))

    for i in 0 ..< coords.count {
        if cum[i] > startKm && cum[i] < endKm {
            slice.append(coords[i])
        }
    }

    slice.append(pointAtDistance(line, endKm))

    return LineString(coordinates: slice.map { [$0.lon, $0.lat] })
}

/// N evenly-spaced points along the line (inclusive of both ends).
func samplePoints(_ line: LineString, n: Int) -> [Coord2] {
    guard n > 0 else { return [] }
    let total = totalDistance(line)
    return (0 ..< n).map { i in
        pointAtDistance(line, Double(i) / Double(n - 1) * total)
    }
}

/// Bounding box [west, south, east, north].
func bboxOf(_ line: LineString) -> BBox {
    var west = Double.infinity, south = Double.infinity
    var east = -Double.infinity, north = -Double.infinity
    for c in line.coordinates {
        let lon = c[0], lat = c[1]
        if lon < west { west = lon }
        if lon > east { east = lon }
        if lat < south { south = lat }
        if lat > north { north = lat }
    }
    return (west, south, east, north)
}

/// Union of bounding boxes. Returns nil for empty input.
func mergeBboxes(_ boxes: [BBox]) -> BBox? {
    guard var result = boxes.first else { return nil }
    for b in boxes.dropFirst() {
        if b.west  < result.west  { result.west  = b.west  }
        if b.south < result.south { result.south = b.south }
        if b.east  > result.east  { result.east  = b.east  }
        if b.north > result.north { result.north = b.north }
    }
    return result
}

func decodeLineString(_ json: String) -> LineString? {
    struct GeoJSONLineString: Decodable {
        var type: String
        var coordinates: [[Double]]
    }
    guard
        let data = json.data(using: .utf8),
        let decoded = try? JSONDecoder().decode(GeoJSONLineString.self, from: data),
        decoded.type == "LineString",
        decoded.coordinates.count >= 2
    else { return nil }
    return LineString(coordinates: decoded.coordinates)
}
