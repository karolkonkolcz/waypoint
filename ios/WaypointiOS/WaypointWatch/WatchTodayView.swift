import SwiftUI

struct WatchTodayView: View {
    let snapshot: WatchTodaySnapshot?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let snapshot {
                    if snapshot.isAvailable {
                        available(snapshot)
                    } else {
                        unavailable(snapshot)
                    }
                } else {
                    unavailable(.unavailable(
                        title: "Waypoint",
                        subtitle: "Otevři iPhone appku pro první synchronizaci."
                    ))
                }
            }
            .navigationTitle("Dnes")
        }
    }

    private func available(_ snapshot: WatchTodaySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(snapshot.title)
                .font(.headline)
                .lineLimit(3)

            if let trailName = snapshot.trailName {
                Text(trailName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            stats(snapshot)

            if let weather = weatherLine(snapshot) {
                section(systemImage: "cloud.sun", title: "Počasí", value: weather)
            }

            if let summary = snapshot.summary {
                Text(summary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(5)
            }

            if snapshot.openTodoCount > 0 {
                VStack(alignment: .leading, spacing: 5) {
                    Label("\(snapshot.openTodoCount) úkolů", systemImage: "checklist")
                        .font(.caption.weight(.semibold))
                    ForEach(snapshot.todoTitles, id: \.self) { title in
                        Text(title)
                            .font(.caption2)
                            .lineLimit(2)
                    }
                }
            }
        }
        .padding(.horizontal, 2)
    }

    private func unavailable(_ snapshot: WatchTodaySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "figure.hiking")
                .font(.title2)
            Text(snapshot.title)
                .font(.headline)
            Text(snapshot.subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 2)
    }

    private func stats(_ snapshot: WatchTodaySnapshot) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                metric("km", value: snapshot.distanceKm.map { String(format: "%.1f", $0) })
                metric("ETA", value: snapshot.etaMinutes.map(formatMinutes))
            }
            HStack(spacing: 6) {
                metric("+m", value: snapshot.ascentM.map { String(format: "%.0f", $0) })
                metric("Obtížnost", value: snapshot.difficultyLabel)
            }
        }
    }

    private func metric(_ label: String, value: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value ?? "-")
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .lineLimit(1)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(7)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
    }

    private func section(systemImage: String, title: String, value: String) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.caption)
                    .lineLimit(2)
            }
        } icon: {
            Image(systemName: systemImage)
        }
    }

    private func weatherLine(_ snapshot: WatchTodaySnapshot) -> String? {
        var parts: [String] = []
        if let condition = snapshot.weatherCondition {
            parts.append(condition)
        }
        if let temperatureC = snapshot.temperatureC {
            parts.append("\(temperatureC) °C")
        }
        if let precipTotalMm = snapshot.precipTotalMm {
            parts.append(String(format: "%.1f mm", precipTotalMm))
        }
        if let rainStartsHour = snapshot.rainStartsHour {
            parts.append("déšť \(String(format: "%02d:00", rainStartsHour))")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func formatMinutes(_ minutes: Int) -> String {
        let hours = minutes / 60
        let remainder = minutes % 60
        if hours == 0 { return "\(remainder)m" }
        if remainder == 0 { return "\(hours)h" }
        return "\(hours)h \(remainder)m"
    }
}

#Preview {
    WatchTodayView(snapshot: WatchTodaySnapshot(
        generatedAt: Date(),
        isAvailable: true,
        title: "Rifugio Bonatti -> La Fouly",
        subtitle: "Dobré ráno",
        trailName: "Tour du Mont Blanc",
        stageType: "trek",
        distanceKm: 19.4,
        ascentM: 860,
        descentM: 1040,
        etaMinutes: 385,
        difficultyLabel: "Těžké",
        summary: "Dnes tě čeká těžký den: 19.4 km s poctivým stoupáním 860 m.",
        weatherCondition: "Polojasno",
        temperatureC: 14,
        precipTotalMm: 1.2,
        rainStartsHour: 15,
        openTodoCount: 2,
        todoTitles: ["Doplnit vodu", "Koupit plyn"]
    ))
}
