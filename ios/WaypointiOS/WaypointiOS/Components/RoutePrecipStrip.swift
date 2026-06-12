//
//  RoutePrecipStrip.swift
//  WaypointiOS
//
//  "Srážky na trase" — a precipitation bar strip that sits directly under the
//  elevation profile and shares its distance axis, so you can read where on the
//  route the rain falls. Bars are colored by intensity (deep blue → cyan at the
//  peak), matching the Weather tab's meteogram. A caption spells out the rain
//  window (start → end clock time) and where it's heaviest.
//

import Charts
import SwiftUI

struct RoutePrecipStrip: View {
    let points: [RoutePrecipPoint]
    var band: RainBand?
    /// Total route distance — the shared x-domain upper bound.
    let maxKm: Double
    /// The profile's max elevation, used only to reserve a leading gutter of the
    /// same width as the profile's y-axis labels so the two charts line up.
    let maxElevationM: Int

    private var maxPrecip: Double { max(points.map(\.precipMm).max() ?? 0, 0.1) }

    private let rainDeep = Color(red: 25 / 255, green: 118 / 255, blue: 210 / 255)
    private let rainLight = Color(red: 100 / 255, green: 210 / 255, blue: 255 / 255)

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("SRÁŽKY NA TRASE")
                .font(.caption2.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(.secondary)

            GeometryReader { geo in
                // `.ratio` bar width is unreliable on a quantitative x-axis
                // (bars collapse to nothing), so derive a fixed width from the
                // plot size instead.
                let barWidth = max(geo.size.width / CGFloat(max(points.count, 1)) * 0.62, 1.5)
                Chart(points) { point in
                    BarMark(
                        x: .value("km", point.km),
                        y: .value("mm", point.precipMm),
                        width: .fixed(barWidth)
                    )
                    .foregroundStyle(barColor(point.precipMm))
                    .cornerRadius(1)
                }
                .chartXScale(domain: 0...max(maxKm, 0.1))
                .chartYScale(domain: 0...maxPrecip)
                .chartXAxis(.hidden)
                .chartYAxis {
                    // Invisible label matching the profile's widest y-label, so
                    // this chart's plot starts at the same x as the profile's.
                    AxisMarks(position: .leading, values: [0]) { _ in
                        AxisValueLabel {
                            Text("\(maxElevationM) m")
                                .font(.system(size: 9))
                                .foregroundStyle(.clear)
                        }
                    }
                }
            }
            .frame(height: 44)

            if let band {
                Label {
                    Text(caption(band))
                        .font(.caption.weight(.medium).monospacedDigit())
                } icon: {
                    Image(systemName: "cloud.rain.fill")
                }
                .foregroundStyle(rainLight)
            }
        }
    }

    private func barColor(_ value: Double) -> Color {
        let t = min(max(value / maxPrecip, 0), 1)
        func lerp(_ a: Double, _ b: Double) -> Double { (a + (b - a) * t) / 255 }
        return Color(
            red: lerp(25, 100),
            green: lerp(118, 210),
            blue: lerp(210, 255)
        )
    }

    private func caption(_ band: RainBand) -> String {
        let peak = String(format: "%.1f", band.peakKm).replacingOccurrences(of: ".", with: ",")
        return "Déšť \(clock(band.startHour)) – \(clock(band.endHour)) · vrchol srážek u \(peak) km"
    }

    private func clock(_ hour: Double) -> String {
        var whole = Int(floor(hour))
        var minutes = Int(((hour - Double(whole)) * 60).rounded())
        if minutes >= 60 { whole += 1; minutes -= 60 }
        return String(format: "%02d:%02d", whole % 24, minutes)
    }
}
