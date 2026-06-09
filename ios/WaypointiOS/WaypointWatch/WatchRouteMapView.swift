import SwiftUI

/// Offline schematic of a route — projects the `[lon, lat]` polyline into a
/// `Canvas` with latitude correction so the shape reads correctly, then marks
/// the start (green) and finish (red). No basemap tiles: this is a glanceable
/// silhouette, the same spirit as the elevation chart, and works with no
/// network — the right default for a hiking watch.
struct WatchRouteMapView: View {
    let polyline: [[Double]]
    var difficultyClass: String?

    private var lineColor: Color { watchDifficultyColor(class: difficultyClass) }

    var body: some View {
        if polyline.count >= 2 {
            Canvas { context, size in
                let pts = projectedPoints(in: size)
                guard pts.count >= 2 else { return }

                var path = Path()
                path.addLines(pts)
                context.stroke(
                    path,
                    with: .color(lineColor),
                    style: StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round)
                )

                if let start = pts.first {
                    marker(at: start, fill: .green, context: &context)
                }
                if let end = pts.last {
                    marker(at: end, fill: .red, context: &context)
                }
            }
            .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
            .overlay {
                RoundedRectangle(cornerRadius: 10).stroke(.white.opacity(0.08))
            }
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.04))
                Label("Bez trasy", systemImage: "map")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func marker(at point: CGPoint, fill: Color, context: inout GraphicsContext) {
        let dot = CGRect(x: point.x - 3.5, y: point.y - 3.5, width: 7, height: 7)
        context.fill(Path(ellipseIn: dot), with: .color(fill))
        context.stroke(Path(ellipseIn: dot), with: .color(.white), lineWidth: 1.4)
    }

    /// Aspect-preserving projection with cos(lat) longitude correction.
    private func projectedPoints(in size: CGSize) -> [CGPoint] {
        let lons = polyline.map { $0[0] }
        let lats = polyline.map { $0[1] }
        guard
            let minLon = lons.min(), let maxLon = lons.max(),
            let minLat = lats.min(), let maxLat = lats.max()
        else { return [] }

        let midLat = (minLat + maxLat) / 2
        let lonScale = cos(midLat * .pi / 180)
        let spanX = max((maxLon - minLon) * lonScale, 0.000_001)
        let spanY = max(maxLat - minLat, 0.000_001)

        let padding: CGFloat = 12
        let drawW = max(size.width - padding * 2, 1)
        let drawH = max(size.height - padding * 2, 1)
        let scale = min(drawW / spanX, drawH / spanY)

        // Centre the route within the canvas.
        let offsetX = padding + (drawW - CGFloat(spanX) * scale) / 2
        let offsetY = padding + (drawH - CGFloat(spanY) * scale) / 2

        return polyline.map { coord in
            let x = offsetX + CGFloat((coord[0] - minLon) * lonScale) * scale
            // Flip y so north is up.
            let y = offsetY + CGFloat(maxLat - coord[1]) * scale
            return CGPoint(x: x, y: y)
        }
    }
}
