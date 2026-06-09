//
//  RouteTimelineView.swift
//  WaypointiOS
//
//  "Kde budeš v kolik" — the ETA × srážky timeline. A vertical rail of stops
//  (start, waypoints, highest point, rain onset, finish) with projected arrival
//  times, driven by `buildRouteTimeline`. The departure stepper re-projects the
//  whole day and triggers a weather re-fetch upstream.
//

import SwiftUI

struct RouteTimelineView: View {
    let timeline: RouteTimeline
    let startHour: Int
    let hasForecast: Bool
    let updating: Bool
    let onStartHourChange: (Int) -> Void

    private var hasStorm: Bool { timeline.rows.contains { $0.isStorm } }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("KDE BUDEŠ V KOLIK")
                        .font(.caption2.weight(.bold))
                        .tracking(0.8)
                        .foregroundStyle(.secondary)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                Spacer()
                departureControl
            }

            timelineRail
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).stroke(.quaternary) }
    }

    private var subtitle: String {
        guard hasForecast else { return "Počasí zatím není v cache." }
        return hasStorm ? "Srážkový řádek je zvýrazněný." : "Po trase zatím bez významných srážek."
    }

    private var departureControl: some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text("ODCHOD")
                .font(.system(size: 9, weight: .bold))
                .tracking(1)
                .foregroundStyle(.tertiary)
            HStack(spacing: 0) {
                stepButton(systemName: "minus", enabled: startHour > 0) {
                    onStartHourChange(startHour - 1)
                }
                Text(String(format: "%02d:00", startHour))
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .frame(width: 52)
                stepButton(systemName: "plus", enabled: startHour < 23) {
                    onStartHourChange(startHour + 1)
                }
            }
            .background(.quaternary.opacity(0.4), in: Capsule())
        }
    }

    private func stepButton(systemName: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.caption.weight(.bold))
                .frame(width: 30, height: 30)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? Color.accentColor : Color.secondary)
        .disabled(!enabled)
    }

    private var timelineRail: some View {
        VStack(spacing: 0) {
            ForEach(Array(timeline.rows.enumerated()), id: \.element.id) { index, row in
                TimelineRow(
                    row: row,
                    isFirst: index == 0,
                    isLast: index == timeline.rows.count - 1
                )
            }
        }
        .overlay(alignment: .top) {
            if updating {
                ProgressView()
                    .controlSize(.small)
                    .padding(6)
                    .background(.regularMaterial, in: Circle())
            }
        }
    }
}

private struct TimelineRow: View {
    let row: RouteTimelineRow
    let isFirst: Bool
    let isLast: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(timeLabel(row.hour))
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(row.isStorm ? tint : .secondary)
                .frame(width: 44, alignment: .leading)

            // Connecting rail + node
            ZStack {
                VStack(spacing: 0) {
                    Rectangle().fill(isFirst ? .clear : Color.secondary.opacity(0.25)).frame(width: 1.5)
                    Rectangle().fill(isLast ? .clear : Color.secondary.opacity(0.25)).frame(width: 1.5)
                }
                Circle()
                    .fill(row.isStorm ? tint : Color(.secondarySystemBackground))
                    .frame(width: 26, height: 26)
                    .overlay(Circle().stroke(row.isStorm ? tint : Color.secondary.opacity(0.3), lineWidth: 1))
                    .overlay {
                        Image(systemName: icon)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(row.isStorm ? .white : .secondary)
                    }
            }
            .frame(width: 26)

            VStack(alignment: .leading, spacing: 1) {
                Text(titleText)
                    .font(.subheadline.weight(row.isStorm ? .bold : .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(meta)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .frame(minHeight: 46)
        .padding(.horizontal, row.isStorm ? 6 : 0)
        .background {
            if row.isStorm {
                RoundedRectangle(cornerRadius: 10).fill(tint.opacity(0.12))
            }
        }
    }

    private var titleText: String {
        if let detail = row.detail, !row.isStorm {
            return "\(detail) · \(row.title)"
        }
        return row.title
    }

    private var meta: String {
        var parts = [String(format: "%.1f km", row.distanceKm)]
        if let ele = row.elevationM { parts.append("\(ele) m") }
        if row.isStorm, let precip = row.precipMm { parts.append(String(format: "%.1f mm/h", precip)) }
        return parts.joined(separator: " · ")
    }

    private var tint: Color { .orange }

    private var icon: String {
        switch row.kind {
        case .start: return "flag.fill"
        case .water: return "drop.fill"
        case .peak: return "mountain.2.fill"
        case .town: return "house.fill"
        case .camp: return "tent.fill"
        case .shelter: return "shield.fill"
        case .resupply: return "shippingbox.fill"
        case .storm: return "cloud.bolt.rain.fill"
        case .finish: return "flag.checkered"
        case .other: return "mappin"
        }
    }
}

private func timeLabel(_ hour: Double) -> String {
    let total = Int((hour * 60).rounded())
    let h = (total / 60) % 24
    let m = total % 60
    return String(format: "%02d:%02d", h, m)
}
