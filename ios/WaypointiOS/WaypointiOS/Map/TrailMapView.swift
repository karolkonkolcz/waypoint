import SwiftUI

struct TrailMapView: View {
    let trail: Trail
    let stages: [Stage]
    var highlightedStageId: String?

    @State private var model = RouteMapViewModel()

    var body: some View {
        Group {
            switch model.state {
            case .idle, .loading:
                ProgressView("Načítám mapu…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .unavailable(let message):
                ContentUnavailableView("Mapa není k dispozici", systemImage: "map", description: Text(message))
            case .loaded(let routes):
                RouteMapScreen(title: "Mapa", routes: routes)
            }
        }
        .navigationTitle("Mapa")
        .navigationBarTitleDisplayMode(.inline)
        .task { model.load(trailId: trail.id, stages: stages, highlightedStageId: highlightedStageId) }
    }
}

struct RouteMapScreen: View {
    let title: String
    let routes: [MapRoute]

    var body: some View {
        VStack(spacing: 0) {
            RouteMapView(routes: routes, interactive: true, showsCurrentLocation: true)
                .frame(maxHeight: .infinity)
            Legend(routes: routes)
        }
        .padding()
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct Legend: View {
    let routes: [MapRoute]

    var body: some View {
        if !routes.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Etapy")
                    .font(.headline)
                ForEach(routes) { route in
                    HStack {
                        Circle()
                            .fill(color(route.color))
                            .frame(width: 10, height: 10)
                        Text(route.title ?? "Trasa")
                            .font(.subheadline)
                        Spacer()
                    }
                    .foregroundStyle(.secondary)
                }
            }
            .padding(.top, 16)
        }
    }

    private func color(_ routeColor: MapRouteColor) -> Color {
        switch routeColor {
        case .easy: return Color(red: 0.09, green: 0.64, blue: 0.29)
        case .moderate: return Color(red: 0.85, green: 0.47, blue: 0.02)
        case .hard: return Color(red: 0.92, green: 0.35, blue: 0.05)
        case .extreme: return Color(red: 0.86, green: 0.15, blue: 0.15)
        case .selected, .fallback: return Color(red: 0.15, green: 0.39, blue: 0.92)
        }
    }
}
