import CoreGraphics
import Foundation

struct MapRoute: Identifiable, Sendable {
    var id: String
    var line: LineString
    var color: MapRouteColor
    var title: String?
}

enum MapRouteColor: String, Sendable {
    case easy
    case moderate
    case hard
    case extreme
    case selected
    case fallback
}

struct ProjectedRoute: Identifiable, Sendable {
    var id: String
    var points: [CGPoint]
    var color: MapRouteColor
}

func mapRouteColor(for difficultyClass: String?) -> MapRouteColor {
    switch difficultyClass?.lowercased() {
    case "easy": return .easy
    case "moderate": return .moderate
    case "hard": return .hard
    case "extreme": return .extreme
    default: return .fallback
    }
}

func projectRoutes(_ routes: [MapRoute], in size: CGSize, padding: CGFloat = 20) -> [ProjectedRoute] {
    guard
        size.width > padding * 2,
        size.height > padding * 2,
        let bounds = mergeBboxes(routes.map { bboxOf($0.line) })
    else { return [] }

    let lonSpan = max(bounds.east - bounds.west, 0.000_001)
    let latSpan = max(bounds.north - bounds.south, 0.000_001)
    let drawableWidth = size.width - padding * 2
    let drawableHeight = size.height - padding * 2

    return routes.map { route in
        let points = route.line.coordinates.map { coordinate in
            let lon = coordinate[0]
            let lat = coordinate[1]
            let x = padding + CGFloat((lon - bounds.west) / lonSpan) * drawableWidth
            let y = padding + CGFloat((bounds.north - lat) / latSpan) * drawableHeight
            return CGPoint(x: x, y: y)
        }
        return ProjectedRoute(id: route.id, points: points, color: route.color)
    }
}
