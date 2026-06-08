import MapLibre
import MapLibreSwiftDSL
import MapLibreSwiftUI
import SwiftUI

/// Real vector basemap (MapTiler `outdoor-v2`, same as the web) with the route
/// polyline drawn on top from local GRDB geometry, coloured by difficulty and
/// framed with `fitBounds`. Falls back to the offline `RouteCanvasView` when no
/// MapTiler key is configured.
///
/// - `interactive`: when `false` the map's pan/zoom gestures are disabled so it
///   can sit inside a `ScrollView`/`List` (dashboard hero, stage section)
///   without stealing scroll. Full-screen contexts pass `true`.
struct RouteMapView: View {
    let routes: [MapRoute]
    /// Kept for source compatibility; embedded maps are non-interactive.
    var interactiveHint: Bool = false
    var interactive: Bool = false

    var body: some View {
        if let styleURL = MapConfig.styleURL {
            mapLibreView(styleURL: styleURL)
        } else {
            RouteCanvasView(routes: routes, showCacheHint: interactiveHint)
        }
    }

    @ViewBuilder
    private func mapLibreView(styleURL: URL) -> some View {
        MapView(
            styleURL: styleURL,
            camera: .constant(initialCamera)
        ) {
            ForEach(Array(routes.enumerated()), id: \.offset) { index, route in
                let coords = route.line.coordinates.map {
                    CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0])
                }
                let source = ShapeSource(identifier: "route-\(index)") {
                    MLNPolylineFeature(coordinates: coords, count: UInt(coords.count))
                }
                LineStyleLayer(identifier: "route-line-\(index)", source: source)
                    .lineColor(uiColor(route.color))
                    .lineWidth(route.color == .selected ? 5 : 4)
                    .lineCap(.round)
                    .lineJoin(.round)
            }
        }
        .unsafeMapViewControllerModifier { controller in
            let mapView = controller.mapView
            mapView.allowsScrolling = interactive
            mapView.allowsZooming = interactive
            mapView.allowsRotating = interactive
            mapView.allowsTilting = interactive
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
        }
    }

    /// Frame the camera to the merged bounds of all routes.
    private var initialCamera: MapViewCamera {
        guard let bbox = mergeBboxes(routes.map { bboxOf($0.line) }) else {
            return .center(CLLocationCoordinate2D(latitude: 48.7, longitude: 19), zoom: 5)
        }
        let bounds = MLNCoordinateBounds(
            sw: CLLocationCoordinate2D(latitude: bbox.south, longitude: bbox.west),
            ne: CLLocationCoordinate2D(latitude: bbox.north, longitude: bbox.east)
        )
        return .boundingBox(bounds, edgePadding: .init(top: 32, left: 32, bottom: 32, right: 32))
    }

    private func uiColor(_ color: MapRouteColor) -> UIColor {
        switch color {
        case .easy: return UIColor(red: 0.09, green: 0.64, blue: 0.29, alpha: 1)
        case .moderate: return UIColor(red: 0.85, green: 0.47, blue: 0.02, alpha: 1)
        case .hard: return UIColor(red: 0.92, green: 0.35, blue: 0.05, alpha: 1)
        case .extreme: return UIColor(red: 0.86, green: 0.15, blue: 0.15, alpha: 1)
        case .selected: return UIColor(red: 0.15, green: 0.39, blue: 0.92, alpha: 1)
        case .fallback: return UIColor(red: 0.15, green: 0.39, blue: 0.92, alpha: 1)
        }
    }
}
