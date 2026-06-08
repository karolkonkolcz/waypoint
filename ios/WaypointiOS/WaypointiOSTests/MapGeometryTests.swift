import CoreGraphics
import Testing
@testable import WaypointiOS

@Suite("MapGeometry")
struct MapGeometryTests {
    @Test func decodesGeoJSONLineString() throws {
        let line = try #require(decodeLineString(#"{"type":"LineString","coordinates":[[14,50],[14.1,50.1]]}"#))

        #expect(line.coordinates.count == 2)
        #expect(line.coordinates[0][0] == 14)
    }

    @Test func projectsRoutesInsideCanvasPadding() {
        let route = MapRoute(
            id: "route-1",
            line: LineString(coordinates: [[0, 0], [1, 1]]),
            color: .fallback,
            title: nil
        )

        let projected = projectRoutes([route], in: CGSize(width: 200, height: 100), padding: 20)

        #expect(projected.count == 1)
        #expect(projected[0].points.allSatisfy { point in
            point.x >= 20 && point.x <= 180 && point.y >= 20 && point.y <= 80
        })
    }

    @Test func mapsDifficultyClassesToRouteColors() {
        #expect(mapRouteColor(for: "easy") == .easy)
        #expect(mapRouteColor(for: "moderate") == .moderate)
        #expect(mapRouteColor(for: "hard") == .hard)
        #expect(mapRouteColor(for: "extreme") == .extreme)
        #expect(mapRouteColor(for: nil) == .fallback)
    }
}
