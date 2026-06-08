import SwiftUI

/// Offline / no-key fallback renderer. Draws the route polyline on a flat
/// background with a reference grid — no map tiles. Used when no MapTiler key
/// is configured (mirrors the web's blank `FALLBACK_STYLE`). The route shape
/// stays readable with no network, per ARCHITECTURE §7.3.
struct RouteCanvasView: View {
    let routes: [MapRoute]
    var showCacheHint: Bool = false

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomLeading) {
                Canvas { context, size in
                    context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(red: 0.91, green: 0.93, blue: 0.89)))
                    drawGrid(context: context, size: size)

                    let projected = projectRoutes(routes, in: size)
                    for route in projected {
                        guard route.points.count >= 2 else { continue }
                        var path = Path()
                        path.move(to: route.points[0])
                        for point in route.points.dropFirst() {
                            path.addLine(to: point)
                        }
                        context.stroke(
                            path,
                            with: .color(routeColor(route.color)),
                            style: StrokeStyle(lineWidth: route.color == .selected ? 5 : 4, lineCap: .round, lineJoin: .round)
                        )
                    }
                }
                .frame(width: proxy.size.width, height: proxy.size.height)

                if showCacheHint {
                    Text("Trasa z lokální cache")
                        .font(.caption2)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(.thinMaterial, in: Capsule())
                        .padding(8)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(.quaternary)
            }
        }
    }

    private func drawGrid(context: GraphicsContext, size: CGSize) {
        var grid = Path()
        let step: CGFloat = 48
        var x: CGFloat = step
        while x < size.width {
            grid.move(to: CGPoint(x: x, y: 0))
            grid.addLine(to: CGPoint(x: x, y: size.height))
            x += step
        }
        var y: CGFloat = step
        while y < size.height {
            grid.move(to: CGPoint(x: 0, y: y))
            grid.addLine(to: CGPoint(x: size.width, y: y))
            y += step
        }
        context.stroke(grid, with: .color(.white.opacity(0.45)), lineWidth: 1)
    }
}

/// SwiftUI difficulty colours, shared by the Canvas renderer and the legend.
func routeColor(_ routeColor: MapRouteColor) -> Color {
    switch routeColor {
    case .easy: return Color(red: 0.09, green: 0.64, blue: 0.29)
    case .moderate: return Color(red: 0.85, green: 0.47, blue: 0.02)
    case .hard: return Color(red: 0.92, green: 0.35, blue: 0.05)
    case .extreme: return Color(red: 0.86, green: 0.15, blue: 0.15)
    case .selected: return Color(red: 0.15, green: 0.39, blue: 0.92)
    case .fallback: return Color(red: 0.15, green: 0.39, blue: 0.92)
    }
}
