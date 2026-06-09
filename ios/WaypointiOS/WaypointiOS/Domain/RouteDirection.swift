//
//  RouteDirection.swift
//  WaypointiOS
//
//  Port of web/lib/domain/routeDirection.ts.
//  Derives a "Start → Cíl" direction from a stage title when it encodes one
//  (e.g. "Den 3: Tatry → Štrbské pleso"); otherwise falls back to the route's
//  first/last coordinate. Coordinate labels are later upgraded to place names
//  by `PlaceNameService` (CLGeocoder, cached).
//

import Foundation

struct RouteDirection: Sendable, Equatable {
    var start: String
    var destination: String
    var label: String
}

private let arrowSeparators = ["→", "->", "=>", "–", "—", " do ", " to "]

private func cleanPart(_ value: String) -> String {
    // Strip a leading "Den 3:" / "Day 2 -" prefix, collapse whitespace.
    let withoutPrefix = value.replacingOccurrences(
        of: #"^\s*(?:den|deň|day)\s*\d+\s*[:.\-–—]?\s*"#,
        with: "",
        options: [.regularExpression, .caseInsensitive]
    )
    return withoutPrefix
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

private func splitOnArrow(_ value: String) -> [String] {
    // Replace every separator with a single sentinel, then split. A bare "-"
    // is intentionally handled last so it doesn't shred hyphenated names that
    // already matched a longer separator.
    var working = value
    for sep in arrowSeparators {
        working = working.replacingOccurrences(of: sep, with: "\u{0001}")
    }
    // Lone hyphen surrounded by spaces, as a word-style separator.
    working = working.replacingOccurrences(
        of: #"\s-\s"#, with: "\u{0001}", options: .regularExpression
    )
    return working.split(separator: "\u{0001}").map(String.init)
}

private func parseDirectionFromTitle(_ title: String?) -> RouteDirection? {
    let cleaned = cleanPart(title ?? "")
    guard !cleaned.isEmpty else { return nil }

    let parts = splitOnArrow(cleaned).map(cleanPart).filter { !$0.isEmpty }
    guard parts.count >= 2 else { return nil }

    let start = parts.first!
    let destination = parts.last!
    guard !start.isEmpty, !destination.isEmpty, start != destination else { return nil }
    return RouteDirection(start: start, destination: destination, label: "\(start) → \(destination)")
}

/// `lat, lon` rounded for a compact, stable coordinate label.
func coordinateLabel(lat: Double, lon: Double) -> String {
    String(format: "%.4f, %.4f", lat, lon)
}

/// Direction from a route line, preferring place names already in the title.
/// Coordinate-only labels carry the raw lat/lon so the geocoder can upgrade them.
func routeDirectionFromLine(_ line: LineString?, title: String?) -> RouteDirection? {
    if let fromTitle = parseDirectionFromTitle(title) { return fromTitle }

    guard let coords = line?.coordinates, coords.count >= 2,
          let first = coords.first, let last = coords.last,
          first.count >= 2, last.count >= 2
    else { return nil }

    let start = coordinateLabel(lat: first[1], lon: first[0])
    let destination = coordinateLabel(lat: last[1], lon: last[0])
    return RouteDirection(start: start, destination: destination, label: "\(start) → \(destination)")
}

func stageDirection(stage: Stage, route line: LineString?) -> RouteDirection? {
    routeDirectionFromLine(line, title: stage.title)
}

/// `true` when a part is a raw "lat, lon" label rather than a place name.
func isCoordinateLabel(_ value: String) -> Bool {
    value.range(of: #"^-?\d+\.\d+,\s*-?\d+\.\d+$"#, options: .regularExpression) != nil
}

func generatedStageTitle(stage: Stage, route line: LineString?, fallbackIndex: Int? = nil) -> String {
    if let direction = stageDirection(stage: stage, route: line) { return direction.label }
    let day = fallbackIndex ?? (stage.orderIndex + 1)
    return stage.stageType == "transit" ? "Přesunový den \(day)" : "Den \(day)"
}

func stageDisplayTitle(stage: Stage, route line: LineString?, fallbackIndex: Int? = nil) -> String {
    let trimmed = stage.title.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? generatedStageTitle(stage: stage, route: line, fallbackIndex: fallbackIndex) : trimmed
}
