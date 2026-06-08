//
//  StageDetailView.swift
//  WaypointiOS
//
//  Stage detail: difficulty badge, ETA, terrain stats, notes.
//

import SwiftUI

struct StageDetailView: View {
    let stage: Stage
    let trail: Trail

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
        }
        .navigationTitle(stage.title)
        .navigationBarTitleDisplayMode(.inline)
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
