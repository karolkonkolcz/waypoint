//
//  Gpx.swift
//  WaypointiOS
//
//  Verbatim port of web/lib/gpx/parse.ts — regex-based GPX parsing with no
//  XML-library dependency. One ParsedTrack per <trk>/<rte> (one hiking day),
//  ordered into hiking sequence (mapy.com "Deň N" / reverse-export handling).
//  Numbers (distance/ascent/descent, NOISE_M=3 noise filter) match the web
//  exactly so an iOS import produces the same rows as the PWA.
//

import Foundation

struct ElevationSample: Sendable, Equatable {
    var dKm: Double
    var eleM: Double
}

struct ParsedGpx: Sendable {
    /// GeoJSON LineString coordinates: [lon, lat, ele].
    var coordinates: [[Double]]
    var totalDistanceKm: Double
    var totalAscentM: Int
    var totalDescentM: Int
    var elevationProfile: [ElevationSample]
}

struct ParsedTrack: Sendable {
    var gpx: ParsedGpx
    var name: String?
    /// First integer found in the track name ("Deň 6" → 6), or nil.
    var dayNumber: Int?
}

enum GpxParseError: LocalizedError, Equatable {
    case noTracks
    case tooFewPoints
    case invalidLatLon

    var errorDescription: String? {
        switch self {
        case .noTracks: return "GPX neobsahuje žádnou trasu s alespoň 2 body"
        case .tooFewPoints: return "GPX musí obsahovat alespoň 2 body trasy"
        case .invalidLatLon: return "Bod trasy má neplatnou hodnotu lat/lon"
        }
    }
}

private let noiseM: Double = 3
private let maxProfilePoints = 500

// MARK: - Regex helpers

// `.dotMatchesLineSeparators` makes `.` span newlines, the Swift equivalent of
// the web's `[\s\S]`. Backreferences (\1) are supported by NSRegularExpression.
private func regex(_ pattern: String) -> NSRegularExpression {
    // Patterns here are compile-time constants and known valid.
    try! NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators])
}

private let trackRe = regex(#"<(trk|rte)\b.*?</\1>"#)
private let nameRe = regex(#"<name>\s*(.*?)\s*</name>"#)
private let pointRe = regex(#"<(trkpt|rtept)(.*?)(?:/>|>(.*?)</\1>)"#)
private let latRe = regex(#"\blat=["']([^"']+)["']"#)
private let lonRe = regex(#"\blon=["']([^"']+)["']"#)
private let eleRe = regex(#"<ele>\s*([\d.eE+\-]+)\s*</ele>"#)

private extension NSTextCheckingResult {
    /// Captured group `i` as a substring of `source`, or nil if not matched.
    func group(_ i: Int, in source: String) -> String? {
        guard i < numberOfRanges,
              let range = Range(range(at: i), in: source) else { return nil }
        return String(source[range])
    }
}

private func firstMatch(_ re: NSRegularExpression, in text: String) -> NSTextCheckingResult? {
    re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))
}

private func matches(_ re: NSRegularExpression, in text: String) -> [NSTextCheckingResult] {
    re.matches(in: text, range: NSRange(text.startIndex..., in: text))
}

// MARK: - Parsing

private struct RawPoint {
    var lat: Double
    var lon: Double
    var ele: Double
}

private func extractPoints(_ xml: String) throws -> [RawPoint] {
    var points: [RawPoint] = []
    for match in matches(pointRe, in: xml) {
        let attrs = match.group(2, in: xml) ?? ""
        let body = match.group(3, in: xml) ?? ""

        guard
            let latStr = firstMatch(latRe, in: attrs)?.group(1, in: attrs),
            let lonStr = firstMatch(lonRe, in: attrs)?.group(1, in: attrs),
            let lat = Double(latStr),
            let lon = Double(lonStr)
        else { throw GpxParseError.invalidLatLon }

        let ele = firstMatch(eleRe, in: body)?.group(1, in: body).flatMap(Double.init) ?? 0
        points.append(RawPoint(lat: lat, lon: lon, ele: ele.isNaN ? 0 : ele))
    }
    return points
}

private func downsampleProfile(_ profile: [ElevationSample]) -> [ElevationSample] {
    guard profile.count > maxProfilePoints else { return profile }
    let step = Double(profile.count - 1) / Double(maxProfilePoints - 1)
    var result = (0 ..< maxProfilePoints).map { profile[Int((Double($0) * step).rounded())] }
    result[result.count - 1] = profile[profile.count - 1]
    return result
}

private func buildFromPoints(_ points: [RawPoint]) throws -> ParsedGpx {
    guard points.count >= 2 else { throw GpxParseError.tooFewPoints }

    let coords = points.map { [$0.lon, $0.lat, $0.ele] }

    var distKm = 0.0
    var ascentM = 0.0
    var descentM = 0.0
    var rawProfile: [ElevationSample] = [ElevationSample(dKm: 0, eleM: coords[0][2])]

    for i in 1 ..< coords.count {
        distKm += haversineKm((coords[i - 1][0], coords[i - 1][1]), (coords[i][0], coords[i][1]))
        let dEle = coords[i][2] - coords[i - 1][2]
        if dEle > noiseM { ascentM += dEle }
        else if dEle < -noiseM { descentM -= dEle }
        rawProfile.append(ElevationSample(dKm: distKm, eleM: coords[i][2]))
    }

    return ParsedGpx(
        coordinates: coords,
        totalDistanceKm: (distKm * 100).rounded() / 100,
        totalAscentM: Int(ascentM.rounded()),
        totalDescentM: Int(descentM.rounded()),
        elevationProfile: downsampleProfile(rawProfile)
    )
}

private func extractDayNumber(_ name: String?) -> Int? {
    guard let name,
          let match = firstMatch(regex(#"\d{1,4}"#), in: name)?.group(0, in: name)
    else { return nil }
    return Int(match)
}

// MARK: - Track ordering (mapy.com reverse-export handling)

private func firstCoord(_ t: ParsedTrack) -> Coord2 {
    (t.gpx.coordinates[0][0], t.gpx.coordinates[0][1])
}

private func lastCoord(_ t: ParsedTrack) -> Coord2 {
    let last = t.gpx.coordinates[t.gpx.coordinates.count - 1]
    return (last[0], last[1])
}

private func gapSum(_ tracks: [ParsedTrack]) -> Double {
    var sum = 0.0
    for i in 0 ..< tracks.count - 1 {
        sum += haversineKm(lastCoord(tracks[i]), firstCoord(tracks[i + 1]))
    }
    return sum
}

private func orderTracks(_ tracks: [ParsedTrack]) -> [ParsedTrack] {
    guard tracks.count > 1 else { return tracks }

    let days = tracks.map(\.dayNumber)
    let allNumbered = days.allSatisfy { $0 != nil }
    let allDistinct = Set(days.compactMap { $0 }).count == tracks.count
    if allNumbered && allDistinct {
        return tracks.sorted { ($0.dayNumber ?? 0) < ($1.dayNumber ?? 0) }
    }

    let reversed = Array(tracks.reversed())
    return gapSum(reversed) < gapSum(tracks) ? reversed : tracks
}

// MARK: - API

/// Parses GPX text into one ParsedTrack per `<trk>`/`<rte>`, ordered into
/// hiking sequence. Tracks are never stitched, so cross-day jumps never pollute
/// the per-day numbers.
func parseGpxTracks(_ xmlText: String) throws -> [ParsedTrack] {
    var tracks: [ParsedTrack] = []
    for block in matches(trackRe, in: xmlText) {
        guard let blockXml = block.group(0, in: xmlText) else { continue }
        let points = try extractPoints(blockXml)
        if points.count < 2 { continue }

        let name = firstMatch(nameRe, in: blockXml)?
            .group(1, in: blockXml)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanName = (name?.isEmpty == false) ? name : nil

        tracks.append(ParsedTrack(
            gpx: try buildFromPoints(points),
            name: cleanName,
            dayNumber: extractDayNumber(cleanName)
        ))
    }

    guard !tracks.isEmpty else { throw GpxParseError.noTracks }
    return orderTracks(tracks)
}

/// Derives a human trail name from a GPX file name:
/// "export-Korzika.gpx" → "Korzika", "gr20_corsica.gpx" → "Gr20 Corsica".
func deriveTrailName(fileName: String) -> String {
    let base = fileName
        .replacingOccurrences(of: #"\.gpx$"#, with: "", options: [.regularExpression, .caseInsensitive])
        .replacingOccurrences(of: #"^export[-_\s]*"#, with: "", options: [.regularExpression, .caseInsensitive])
    let words = base
        .replacingOccurrences(of: #"[-_]+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)
    guard !words.isEmpty else { return "Importovaný trek" }
    return words
        .split(separator: " ")
        .map { $0.prefix(1).uppercased() + $0.dropFirst() }
        .joined(separator: " ")
}

/// JSON GeoJSON LineString text for a parsed track (for the `routes.geojson` column).
func geojsonString(coordinates: [[Double]]) -> String {
    let body = coordinates
        .map { "[\(jsonNum($0[0])),\(jsonNum($0[1])),\(jsonNum($0[2]))]" }
        .joined(separator: ",")
    return #"{"type":"LineString","coordinates":[\#(body)]}"#
}

/// JSON text for an elevation profile (for the `routes.elevation_profile` column).
func elevationProfileString(_ profile: [ElevationSample]) -> String {
    let body = profile
        .map { #"{"d_km":\#(jsonNum($0.dKm)),"ele_m":\#(jsonNum($0.eleM))}"# }
        .joined(separator: ",")
    return "[\(body)]"
}

private func jsonNum(_ value: Double) -> String {
    // Integers render without a trailing ".0"; everything else as-is.
    if value == value.rounded() && abs(value) < 1e15 {
        return String(Int(value))
    }
    return String(value)
}
