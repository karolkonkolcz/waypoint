import SwiftUI

/// Browse every stage of the active trail: a list that drills into a per-stage
/// map + profile + stats. Data comes from the cached `WatchTrailOverview` — no
/// live database on the watch.
struct WatchStageListView: View {
    let overview: WatchTrailOverview?

    var body: some View {
        Group {
            if let overview, !overview.stages.isEmpty {
                List {
                    ForEach(overview.stages) { stage in
                        NavigationLink {
                            WatchStageDetailView(stage: stage, trailName: overview.trailName)
                        } label: {
                            row(stage)
                        }
                    }
                }
            } else {
                ScrollView {
                    Text("Etapy se zobrazí po synchronizaci s iPhonem.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 12)
                }
            }
        }
        .navigationTitle("Etapy")
    }

    private func row(_ stage: WatchStageSummary) -> some View {
        HStack(spacing: 9) {
            Circle()
                .fill(watchDifficultyColor(class: stage.difficultyClass))
                .frame(width: 9, height: 9)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(stage.dayNumber.map { "D\($0)" } ?? "Přesun")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(stage.dayNumber == nil ? Color.secondary : Color.orange)
                    Text(stage.title)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                }
                Text(subtitle(stage))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            if stage.isToday {
                Spacer(minLength: 2)
                Text("Dnes")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(.orange, in: Capsule())
            }
        }
        .padding(.vertical, 2)
    }

    private func subtitle(_ stage: WatchStageSummary) -> String {
        var parts = [String(format: "%.1f km", stage.distanceKm)]
        if stage.ascentM > 0 { parts.append("\(Int(stage.ascentM.rounded()))m") }
        if let label = stage.difficultyLabel { parts.append(label) }
        return parts.joined(separator: " · ")
    }
}

struct WatchStageDetailView: View {
    let stage: WatchStageSummary
    let trailName: String
    @State private var page = 0

    var body: some View {
        TabView(selection: $page) {
            mapPage.tag(0)
            profilePage.tag(1)
            statsPage.tag(2)
        }
        .tabViewStyle(.page(indexDisplayMode: .automatic))
        .navigationTitle(stage.dayNumber.map { "D\($0)" } ?? "Přesun")
    }

    private var mapPage: some View {
        VStack(alignment: .leading, spacing: 8) {
            header(systemImage: "map")
            WatchRouteMapView(polyline: stage.routePolyline, difficultyClass: stage.difficultyClass)
                .frame(maxWidth: .infinity)
                .frame(height: 120)
        }
        .padding(.horizontal, 2)
    }

    private var profilePage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                header(systemImage: "chart.xyaxis.line")
                if stage.routeProfile.count >= 2 {
                    RouteProfileChart(points: stage.routeProfile)
                        .frame(height: 92)
                    HStack(spacing: 6) {
                        metric("Start", stage.routeProfile.first.map { "\($0.elevationM)m" })
                        metric("Max", stage.routeProfile.map(\.elevationM).max().map { "\($0)m" })
                    }
                } else {
                    Text("Profil není uložený.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 12)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private var statsPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                header(systemImage: "info.circle")
                Text(stage.title)
                    .font(.caption.weight(.semibold))
                    .lineLimit(3)
                if let date = stage.dateLabel {
                    Text(date).font(.caption2).foregroundStyle(.secondary)
                }
                VStack(spacing: 6) {
                    HStack(spacing: 6) {
                        metric("km", String(format: "%.1f", stage.distanceKm))
                        metric("ETA", stage.etaMinutes.map(formatWatchMinutes))
                    }
                    HStack(spacing: 6) {
                        metric("+m", "\(Int(stage.ascentM.rounded()))")
                        metric("Obtížnost", stage.difficultyLabel, tint: watchDifficultyColor(class: stage.difficultyClass))
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func header(systemImage: String) -> some View {
        Label(trailName, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .labelStyle(.titleAndIcon)
            .lineLimit(1)
            .foregroundStyle(.secondary)
    }

    private func metric(_ label: String, _ value: String?, tint: Color = .primary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value ?? "-")
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(7)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
    }
}
