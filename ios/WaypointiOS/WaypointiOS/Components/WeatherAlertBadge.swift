//
//  WeatherAlertBadge.swift
//  WaypointiOS
//
//  Compact MeteoAlarm presentation for the Today screen. When warnings are
//  active it renders one severity-coloured row each; when clear it collapses to
//  a single slim reassurance line so the panel still proves the API was checked
//  without eating vertical space.
//

import SwiftUI

struct WeatherAlertBadge: View {
    let alerts: [WeatherAlert]
    var stale: Bool = false
    var loading: Bool = false
    var offline: Bool = false
    var checkedAt: Date?

    var body: some View {
        if alerts.isEmpty {
            emptyRow
        } else {
            VStack(spacing: 8) {
                ForEach(alerts) { alert in
                    AlertRow(alert: alert)
                }
            }
        }
    }

    private var emptyRow: some View {
        HStack(spacing: 8) {
            Group {
                if loading {
                    ProgressView().controlSize(.small)
                } else if offline {
                    Image(systemName: "wifi.slash").foregroundStyle(.secondary)
                } else {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                }
            }
            .frame(width: 18)

            Text(emptyTitle)
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            if let checkedAt, !loading {
                Text(relativeAge(checkedAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).stroke(.quaternary) }
    }

    private var emptyTitle: String {
        if loading { return "Kontroluji meteo výstrahy…" }
        if offline { return "Výstrahy bez aktuální kontroly" }
        return "Bez aktivních meteo výstrah"
    }
}

private struct AlertRow: View {
    let alert: WeatherAlert

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.subheadline)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(alert.event)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(tint)
                if !alert.areas.isEmpty {
                    Text(areaSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let expires = formattedExpiry {
                    Text("do \(expires)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).stroke(tint.opacity(0.35)) }
    }

    private var tint: Color {
        switch alert.severity {
        case .yellow: return .yellow
        case .orange: return .orange
        case .red: return .red
        }
    }

    private var areaSummary: String {
        let shown = alert.areas.prefix(3).joined(separator: ", ")
        let extra = alert.areas.count - 3
        return extra > 0 ? "\(shown) +\(extra) další" : shown
    }

    private var formattedExpiry: String? {
        guard let expires = alert.expires,
              let date = ISO8601DateFormatter().date(from: expires) else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "cs_CZ")
        f.dateFormat = "EEE HH:mm"
        return f.string(from: date)
    }
}

private func relativeAge(_ date: Date) -> String {
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .short
    return f.localizedString(for: date, relativeTo: Date())
}
