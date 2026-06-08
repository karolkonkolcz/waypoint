//
//  TrailDetailView.swift
//  WaypointiOS
//
//  Trail overview + stage list. Difficulty + ETA computed live via domain engines.
//

import SwiftUI

struct TrailDetailView: View {
    let trail: Trail
    @State private var model = TrailDetailViewModel()

    var body: some View {
        content
            .navigationTitle(trail.name)
            .navigationBarTitleDisplayMode(.large)
            .task { await model.load(trailId: trail.id) }
            .refreshable { await model.load(trailId: trail.id) }
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .idle, .loading:
            ProgressView("Načítám etapy…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .loaded(let stages) where stages.isEmpty:
            ContentUnavailableView(
                "Žádné etapy",
                systemImage: "map.fill",
                description: Text("Tato trasa zatím nemá etapy.")
            )

        case .loaded(let stages):
            List {
                if let desc = trail.description, !desc.isEmpty {
                    Section {
                        Text(desc)
                            .foregroundStyle(.secondary)
                    }
                }
                Section("Etapy (\(stages.count))") {
                    ForEach(stages) { stage in
                        NavigationLink {
                            StageDetailView(stage: stage, trail: trail)
                        } label: {
                            StageRow(stage: stage, trail: trail)
                        }
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        TrailMapView(trail: trail, stages: stages)
                    } label: {
                        Image(systemName: "map")
                    }
                    .accessibilityLabel("Mapa")
                }
            }

        case .failed(let message):
            ContentUnavailableView {
                Label("Chyba načítání", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Zkusit znovu") { Task { await model.load(trailId: trail.id) } }
            }
        }
    }
}

// MARK: - Stage row

private struct StageRow: View {
    let stage: Stage
    let trail: Trail

    private var difficulty: DifficultyResult {
        stage.computedDifficulty(paceKmh: trail.defaultPaceKmh)
    }

    private var etaHours: Double {
        naismithHours(distanceKm: stage.distanceKm, ascentM: stage.ascentM, paceKmh: trail.defaultPaceKmh)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(stage.title)
                    .font(.headline)
                Spacer()
                DifficultyBadge(result: difficulty)
            }

            HStack(spacing: 12) {
                if let dateStr = stageDate(date: stage.date, orderIndex: stage.orderIndex, trailStartDate: trail.startDate) {
                    Label(formatStageDate(dateStr), systemImage: "calendar")
                }
                Label(String(format: "%.1f km", stage.distanceKm), systemImage: "arrow.triangle.swap")
                Label(etaLabel, systemImage: "clock")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if stage.ascentM > 0 || stage.descentM > 0 {
                HStack(spacing: 12) {
                    Label(String(format: "+%.0f m", stage.ascentM), systemImage: "arrow.up.right")
                    Label(String(format: "−%.0f m", stage.descentM), systemImage: "arrow.down.right")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var etaLabel: String {
        let h = Int(etaHours)
        let m = Int((etaHours - Double(h)) * 60)
        if h == 0 { return "\(m) min" }
        if m == 0 { return "\(h) h" }
        return "\(h) h \(m) min"
    }
}
