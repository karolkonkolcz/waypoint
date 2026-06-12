//
//  ElevationProfileChart.swift
//  WaypointiOS
//
//  "Profil trasy" — the stage elevation profile. Dragging a finger across the
//  chart scrubs along the route: the parent binds `scrubKm` and drops a pin on
//  the map at the matching coordinate. A rain-onset marker shows where the first
//  significant precipitation is projected.
//

import Charts
import SwiftUI

struct ElevationProfileChart: View {
    let profile: [ElevationPoint]
    /// Distance scrubbed by the user, in km. nil when not touching.
    @Binding var scrubKm: Double?
    /// The hiker's live position projected onto the route, in km from start.
    /// nil when location is unknown or off-route. Renders a green "you are here"
    /// marker that coexists with scrubbing.
    var currentKm: Double?

    private var maxKm: Double { profile.last?.dKm ?? 0 }
    private var minEle: Double { profile.map(\.eleM).min() ?? 0 }
    private var maxEle: Double { profile.map(\.eleM).max() ?? 0 }

    private var scrubElevation: Int? {
        guard let scrubKm else { return nil }
        return elevationAtDistance(profile, scrubKm)
    }

    private var currentElevation: Int? {
        guard let currentKm else { return nil }
        return elevationAtDistance(profile, currentKm)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            Chart {
                ForEach(Array(profile.enumerated()), id: \.offset) { _, point in
                    AreaMark(
                        x: .value("km", point.dKm),
                        y: .value("m", point.eleM)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(
                        .linearGradient(
                            colors: [Color.accentColor.opacity(0.28), Color.accentColor.opacity(0.02)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )

                    LineMark(
                        x: .value("km", point.dKm),
                        y: .value("m", point.eleM)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(Color.accentColor)
                    .lineStyle(StrokeStyle(lineWidth: 2))
                }

                if let currentKm, let ele = currentElevation {
                    RuleMark(x: .value("km", currentKm))
                        .foregroundStyle(Color.green.opacity(0.7))
                        .lineStyle(StrokeStyle(lineWidth: 1.5))
                    PointMark(
                        x: .value("km", currentKm),
                        y: .value("m", Double(ele))
                    )
                    .foregroundStyle(Color.green)
                    .symbolSize(150)
                }

                if let scrubKm, let ele = scrubElevation {
                    RuleMark(x: .value("km", scrubKm))
                        .foregroundStyle(Color.orange)
                        .lineStyle(StrokeStyle(lineWidth: 1.5))
                    PointMark(
                        x: .value("km", scrubKm),
                        y: .value("m", Double(ele))
                    )
                    .foregroundStyle(Color.orange)
                    .symbolSize(120)
                }
            }
            .chartYScale(domain: yDomain)
            .chartXScale(domain: 0...max(maxKm, 0.1))
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let m = value.as(Double.self) {
                            Text("\(Int(m)) m").font(.system(size: 9))
                        }
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 4)) { value in
                    AxisValueLabel {
                        if let km = value.as(Double.self) {
                            Text("\(Int(km))").font(.system(size: 9))
                        }
                    }
                }
            }
            .frame(height: 150)
            .chartOverlay { proxy in
                GeometryReader { geo in
                    Rectangle().fill(.clear).contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { drag in
                                    guard let plotFrame = proxy.plotFrame else { return }
                                    let origin = geo[plotFrame].origin
                                    let x = drag.location.x - origin.x
                                    if let km: Double = proxy.value(atX: x) {
                                        scrubKm = min(max(km, 0), maxKm)
                                    }
                                }
                                .onEnded { _ in scrubKm = nil }
                        )
                }
            }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("PROFIL TRASY")
                .font(.caption2.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(.secondary)
            Spacer()
            if let scrubKm, let ele = scrubElevation {
                Text(String(format: "%.1f km · %d m", scrubKm, ele))
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.orange)
                    .transition(.opacity)
            } else if let currentKm, let ele = currentElevation {
                Label(String(format: "%.1f km · %d m", currentKm, ele), systemImage: "location.fill")
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.green)
                    .transition(.opacity)
            } else {
                Text("Táhni prstem")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private var yDomain: ClosedRange<Double> {
        let pad = max((maxEle - minEle) * 0.12, 10)
        return (minEle - pad)...(maxEle + pad)
    }
}
