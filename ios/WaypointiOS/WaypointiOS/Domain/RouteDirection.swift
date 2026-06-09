import Foundation

struct RouteDirection: Sendable {
    var start: String
    var destination: String
    var label: String { "\(start) → \(destination)" }
}

private func cleanDirectionPart(_ value: String) -> String {
    let pattern = #"^\s*(?:den|deň|day)\s*\d+\s*[:.\-–—]?\s*"#
    let stripped = value.replacingOccurrences(of: pattern, with: "", options: [.regularExpression, .caseInsensitive])
    return stripped
        .components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
}

private func directionFromTitle(_ title: String?) -> RouteDirection? {
    let cleaned = cleanDirectionPart(title ?? "")
    guard !cleaned.isEmpty else { return nil }

    let separators = ["→", "->", "=>", "–", "—", "-", " do ", " to "]
    for separator in separators {
        let parts = cleaned
            .components(separatedBy: separator)
            .map(cleanDirectionPart)
            .filter { !$0.isEmpty }
        if parts.count >= 2, let start = parts.first, let destination = parts.last, start != destination {
            return RouteDirection(start: start, destination: destination)
        }
    }
    return nil
}

private func pointLabel(_ point: [Double]) -> String {
    guard point.count >= 2 else { return "Bod trasy" }
    return String(format: "%.4f, %.4f", point[1], point[0])
}

func routeDirection(line: LineString?, title: String? = nil) -> RouteDirection? {
    if let fromTitle = directionFromTitle(title) { return fromTitle }
    guard let coords = line?.coordinates, coords.count >= 2 else { return nil }
    return RouteDirection(start: pointLabel(coords[0]), destination: pointLabel(coords[coords.count - 1]))
}

func generatedStageTitle(stage: Stage, line: LineString?, fallbackIndex: Int? = nil) -> String {
    if let direction = routeDirection(line: line, title: stage.title) {
        return direction.label
    }
    let day = fallbackIndex ?? stage.orderIndex + 1
    return stage.stageType == "transit" ? "Přesunový den \(day)" : "Den \(day)"
}

func stageDisplayTitle(stage: Stage, line: LineString?, fallbackIndex: Int? = nil) -> String {
    let title = stage.title.trimmingCharacters(in: .whitespacesAndNewlines)
    return title.isEmpty ? generatedStageTitle(stage: stage, line: line, fallbackIndex: fallbackIndex) : title
}
