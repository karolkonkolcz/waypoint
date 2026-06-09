//
//  StageDetailView.swift
//  WaypointiOS
//
//  Stage detail: difficulty badge, ETA, terrain stats, notes.
//

import Charts
import SwiftUI

struct StageDetailView: View {
    let stage: Stage
    let trail: Trail
    @State private var weatherModel = StageWeatherViewModel()

    private var difficulty: DifficultyResult {
        stage.computedDifficulty(paceKmh: trail.defaultPaceKmh)
    }

    private var etaHours: Double {
        naismithHours(distanceKm: stage.distanceKm, ascentM: stage.ascentM, paceKmh: trail.defaultPaceKmh)
    }

    var body: some View {
        List {
            // Header
            Section {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        if let dateStr = stageDate(date: stage.date, orderIndex: stage.orderIndex, trailStartDate: trail.startDate) {
                            Text(formatStageDate(dateStr))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Text(stage.title)
                            .font(.title2.bold())
                    }
                    Spacer()
                    DifficultyBadge(result: difficulty)
                }
            }

            // Terrain stats
            Section("Statistiky") {
                StatRow(label: "Vzdálenost", value: String(format: "%.1f km", stage.distanceKm), icon: "arrow.triangle.swap")
                StatRow(label: "Převýšení ↑", value: String(format: "%.0f m", stage.ascentM), icon: "arrow.up.right")
                StatRow(label: "Klesání ↓", value: String(format: "%.0f m", stage.descentM), icon: "arrow.down.right")
                StatRow(label: "Odhadovaný čas", value: formattedETA, icon: "clock")
                StatRow(label: "Obtížnost", value: "\(difficulty.score) / 100", icon: "speedometer")
                if let name = stage.locationName {
                    StatRow(label: "Místo přenocování", value: name, icon: "bed.double")
                }
            }

            // Notes
            if let notes = stage.notes, !notes.isEmpty {
                Section("Poznámky") {
                    Text(notes)
                        .foregroundStyle(.secondary)
                }
            }

            WeatherSection(state: weatherModel.state) {
                Task { await weatherModel.refresh(stage: stage, trail: trail) }
            }

            StageMapSection(stage: stage)
        }
        .navigationTitle(stage.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await weatherModel.load(stage: stage, trail: trail) }
        .refreshable { await weatherModel.refresh(stage: stage, trail: trail) }
    }

    private var formattedETA: String {
        let h = Int(etaHours)
        let m = Int((etaHours - Double(h)) * 60)
        if h == 0 { return "\(m) min" }
        if m == 0 { return "\(h) h" }
        return "\(h) h \(m) min"
    }
}

// MARK: - Helpers

private struct WeatherSection: View {
    let state: StageWeatherViewModel.State
    let refresh: () -> Void

    var body: some View {
        Section("Počasí") {
            switch state {
            case .idle, .loading:
                HStack {
                    ProgressView()
                    Text("Načítám počasí…")
                        .foregroundStyle(.secondary)
                }

            case .unavailable(let message):
                ContentUnavailableView {
                    Label("Počasí není k dispozici", systemImage: "cloud.sun")
                } description: {
                    Text(message)
                } actions: {
                    Button("Zkusit znovu", action: refresh)
                }

            case .loaded(let snapshot, let series, let fetchedAt, let isStale, let isRefreshing, let message):
                WeatherSummary(snapshot: snapshot, fetchedAt: fetchedAt, isStale: isStale, isRefreshing: isRefreshing)
                MeteogramView(series: series)
                    .padding(.vertical, 6)
                if let hour = snapshot.rainStartsHour, let km = snapshot.rainStartsKm {
                    Label("Déšť kolem \(formatHour(hour)), přibližně na \(String(format: "%.1f km", km))", systemImage: "cloud.rain")
                        .foregroundStyle(.blue)
                } else {
                    Label("Déšť na trase zatím nevychází", systemImage: "checkmark.circle")
                        .foregroundStyle(.secondary)
                }
                if let message {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct StageMapSection: View {
    let stage: Stage
    @State private var model = RouteMapViewModel()

    var body: some View {
        Section("Mapa") {
            switch model.state {
            case .idle, .loading:
                HStack {
                    ProgressView()
                    Text("Načítám trasu…")
                        .foregroundStyle(.secondary)
                }
            case .unavailable(let message):
                ContentUnavailableView("Mapa není k dispozici", systemImage: "map", description: Text(message))
            case .loaded(let routes):
                RouteMapView(routes: routes, interactiveHint: true)
                    .frame(height: 224)
            }
        }
        .task { model.load(stage: stage) }
    }
}

private struct WeatherSummary: View {
    let snapshot: WeatherSnapshot
    let fetchedAt: Date
    let isStale: Bool
    let isRefreshing: Bool

    private var midday: WeatherEntry? {
        snapshot.entries.first { $0.hour == 12 } ?? snapshot.entries.first
    }

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                if let midday {
                    Text("\(weatherConditionLabel(midday.condition)), \(midday.tempC) °C")
                        .font(.headline)
                    Text("Srážky \(String(format: "%.1f mm", snapshot.precipTotalMm)) · vítr max \(snapshot.windMaxKmh) km/h")
                        .foregroundStyle(.secondary)
                }
                Text("\(isStale ? "Uložená" : "Aktuální") · \(relativeAge(fetchedAt))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if isRefreshing {
                ProgressView()
            }
        }
    }
}

private func formatHour(_ hour: Int) -> String {
    let dayHour = hour >= 24 ? hour - 24 : hour
    return String(format: "%02d:00", dayHour)
}

private func relativeAge(_ date: Date) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .short
    return formatter.localizedString(for: date, relativeTo: Date())
}

private struct StatRow: View {
    let label: String
    let value: String
    let icon: String

    var body: some View {
        HStack {
            Label(label, systemImage: icon)
                .foregroundStyle(.primary)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }
}
