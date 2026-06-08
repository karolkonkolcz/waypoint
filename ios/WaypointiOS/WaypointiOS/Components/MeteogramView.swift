import Charts
import SwiftUI

/// Shared temperature + precipitation meteogram used on both the stage
/// detail screen and the current-position weather tab.
struct MeteogramView: View {
    let entries: [WeatherEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Chart(entries) { entry in
                LineMark(
                    x: .value("Čas", formatHour(entry.hour)),
                    y: .value("Teplota", entry.tempC)
                )
                .foregroundStyle(.red)
                PointMark(
                    x: .value("Čas", formatHour(entry.hour)),
                    y: .value("Teplota", entry.tempC)
                )
                .foregroundStyle(.red)
            }
            .chartYAxisLabel("°C")
            .frame(height: 100)

            Chart(entries) { entry in
                BarMark(
                    x: .value("Čas", formatHour(entry.hour)),
                    y: .value("Srážky", entry.precipMm)
                )
                .foregroundStyle(.blue)
            }
            .chartYAxisLabel("mm")
            .frame(height: 80)
        }
    }

    private func formatHour(_ hour: Int) -> String {
        let dayHour = hour >= 24 ? hour - 24 : hour
        return String(format: "%02d:00", dayHour)
    }
}
