import Charts
import SwiftUI

/// Stacked multi-panel meteogram matching the web `/weather` chart: temperature
/// (with daily min/max band), cloud layers, precipitation, pressure, wind, and
/// wind direction. Each panel renders only when its series is present, so a
/// `limited` series (offline / stage detail) collapses to just the temperature,
/// precipitation, and wind panels.
struct MeteogramView: View {
    let series: MeteogramSeries

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if series.limited {
                Text("Omezená data bez připojení — z uložené předpovědi zobrazujeme teplotu, srážky a vítr.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
            }
            if series.temperature != nil {
                panel("Teplota (°C)", height: 150) { temperatureChart }
            }
            if hasClouds {
                panel("Oblačnost (%)") { cloudChart }
            }
            if series.rain != nil || series.snow != nil {
                panel("Srážky (mm)") { precipitationChart }
            }
            if series.pressure != nil {
                panel("Tlak (hPa)") { pressureChart }
            }
            if series.windSpeed != nil {
                panel("Vítr (km/h)") { windChart }
            }
            if series.windDir != nil {
                panel("Směr větru (°)") { windDirectionChart }
            }
        }
    }

    private var hasClouds: Bool {
        series.cloudLow != nil || series.cloudMid != nil || series.cloudHigh != nil
    }

    // MARK: Panels

    @ViewBuilder
    private var temperatureChart: some View {
        Chart {
            ForEach(bands) { band in
                AreaMark(
                    x: .value("Čas", band.date),
                    yStart: .value("Min", band.low),
                    yEnd: .value("Max", band.high)
                )
                .foregroundStyle(Palette.temperature.opacity(0.14))
            }
            ForEach(dated(series.temperature)) { point in
                LineMark(x: .value("Čas", point.date), y: .value("Teplota", point.value))
                    .foregroundStyle(Palette.temperature)
                    .lineStyle(StrokeStyle(lineWidth: 2))
                    .interpolationMethod(.monotone)
            }
        }
        .modifier(MeteogramAxis(domain: xDomain))
    }

    // Cloud layers are independent 0–100 % bands that should overlap (not
    // stack), so each is its own chart aligned by a shared X/Y domain; only the
    // front (low) layer draws the axes. Order matches web: high → mid → low.
    private var cloudChart: some View {
        ZStack {
            cloudLayer(series.cloudHigh, color: Palette.cloudHigh, showAxes: false)
            cloudLayer(series.cloudMid, color: Palette.cloudMid, showAxes: false)
            cloudLayer(series.cloudLow, color: Palette.cloudLow, showAxes: true)
        }
    }

    private func cloudLayer(_ values: [Double]?, color: Color, showAxes: Bool) -> some View {
        Chart(dated(values)) { point in
            AreaMark(x: .value("Čas", point.date), y: .value("Oblačnost", point.value))
                .foregroundStyle(color.opacity(0.4))
        }
        .chartYScale(domain: 0 ... 100)
        .chartYAxis(showAxes ? .automatic : .hidden)
        .modifier(MeteogramAxis(domain: xDomain, showLabels: showAxes))
    }

    // Rain + snow as a genuine stacked bar (rain bottom, snow on top).
    private var precipitationChart: some View {
        Chart(precipPoints) { point in
            BarMark(x: .value("Čas", point.date), y: .value("Srážky", point.value))
                .foregroundStyle(by: .value("Typ", point.kind))
        }
        .chartForegroundStyleScale(["déšť": Palette.rain, "sníh": Palette.snow])
        .chartLegend(.hidden)
        .modifier(MeteogramAxis(domain: xDomain))
    }

    private var pressureChart: some View {
        Chart(dated(series.pressure)) { point in
            LineMark(x: .value("Čas", point.date), y: .value("Tlak", point.value))
                .foregroundStyle(Palette.pressure)
                .lineStyle(StrokeStyle(lineWidth: 2))
                .interpolationMethod(.monotone)
        }
        .modifier(MeteogramAxis(domain: xDomain))
    }

    private var windChart: some View {
        Chart {
            ForEach(dated(series.windSpeed)) { point in
                LineMark(x: .value("Čas", point.date), y: .value("Vítr", point.value), series: .value("S", "vítr"))
                    .foregroundStyle(Palette.wind)
                    .lineStyle(StrokeStyle(lineWidth: 2))
                    .interpolationMethod(.monotone)
            }
            ForEach(dated(series.windGusts)) { point in
                LineMark(x: .value("Čas", point.date), y: .value("Nárazy", point.value), series: .value("S", "nárazy"))
                    .foregroundStyle(Palette.wind)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .interpolationMethod(.monotone)
            }
        }
        .modifier(MeteogramAxis(domain: xDomain))
    }

    private var windDirectionChart: some View {
        Chart(dated(series.windDir)) { point in
            PointMark(x: .value("Čas", point.date), y: .value("Směr", point.value))
                .foregroundStyle(Palette.windDir)
                .symbolSize(16)
        }
        .chartYScale(domain: 0 ... 360)
        .chartYAxis {
            AxisMarks(values: [0, 90, 180, 270, 360]) { value in
                AxisGridLine()
                AxisValueLabel {
                    if let degrees = value.as(Double.self) {
                        Text("\(Int(degrees))°")
                    }
                }
            }
        }
        .modifier(MeteogramAxis(domain: xDomain))
    }

    // MARK: Layout helpers

    @ViewBuilder
    private func panel<Content: View>(
        _ title: String,
        height: CGFloat = 110,
        @ViewBuilder _ content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(.secondary)
            content()
                .frame(height: height)
        }
    }

    // MARK: Data shaping

    private var xDomain: ClosedRange<Date> {
        guard let first = series.time.first, let last = series.time.last, first < last else {
            let now = Date()
            return now ... now.addingTimeInterval(3600)
        }
        return first ... last
    }

    private func dated(_ values: [Double]?) -> [DatedValue] {
        guard let values else { return [] }
        return zip(series.time, values).map { DatedValue(date: $0, value: $1) }
    }

    private var bands: [TempBand] {
        guard let low = series.tempMin, let high = series.tempMax else { return [] }
        return zip(series.time, zip(low, high)).map { TempBand(date: $0, low: $1.0, high: $1.1) }
    }

    private var precipPoints: [PrecipPoint] {
        var points: [PrecipPoint] = []
        if let rain = series.rain {
            points += zip(series.time, rain).map { PrecipPoint(date: $0, kind: "déšť", value: $1) }
        }
        if let snow = series.snow {
            points += zip(series.time, snow).map { PrecipPoint(date: $0, kind: "sníh", value: $1) }
        }
        return points
    }
}

// MARK: - Plottable point types

private struct DatedValue: Identifiable {
    let id = UUID()
    let date: Date
    let value: Double
}

private struct TempBand: Identifiable {
    let id = UUID()
    let date: Date
    let low: Double
    let high: Double
}

private struct PrecipPoint: Identifiable {
    let id = UUID()
    let date: Date
    let kind: String
    let value: Double
}

// MARK: - Shared time axis

/// Day boundaries (UTC midnight) get a weekday/day label; intermediate ticks
/// show the clock hour — matching the web meteogram's time axis. A fixed UTC
/// calendar keeps tick boundaries aligned with the wall-clock hour parsed from
/// Open-Meteo's local-time stamps.
private struct MeteogramAxis: ViewModifier {
    let domain: ClosedRange<Date>
    var showLabels = true

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }()

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = utcCalendar
        formatter.timeZone = utcCalendar.timeZone
        formatter.locale = Locale(identifier: "cs_CZ")
        formatter.dateFormat = "EEE d."
        return formatter
    }()

    func body(content: Content) -> some View {
        content
            .chartXScale(domain: domain)
            .environment(\.calendar, Self.utcCalendar)
            .environment(\.timeZone, Self.utcCalendar.timeZone)
            .chartXAxis {
                AxisMarks(values: .stride(by: .hour, count: 6)) { value in
                    AxisGridLine()
                    AxisTick()
                    if showLabels {
                        AxisValueLabel {
                            if let date = value.as(Date.self) {
                                Text(Self.label(for: date))
                            }
                        }
                    }
                }
            }
    }

    private static func label(for date: Date) -> String {
        let hour = utcCalendar.component(.hour, from: date)
        if hour == 0 { return dayFormatter.string(from: date) }
        return String(format: "%02d:00", hour)
    }
}

// MARK: - Palette (matches web/components/weather/Meteogram.tsx)

private enum Palette {
    static let temperature = Color(red: 243 / 255, green: 112 / 255, blue: 19 / 255)
    static let cloudHigh = Color(red: 144 / 255, green: 164 / 255, blue: 174 / 255)
    static let cloudMid = Color(red: 96 / 255, green: 125 / 255, blue: 139 / 255)
    static let cloudLow = Color(red: 55 / 255, green: 71 / 255, blue: 79 / 255)
    static let rain = Color(red: 25 / 255, green: 118 / 255, blue: 210 / 255)
    static let snow = Color(red: 144 / 255, green: 202 / 255, blue: 249 / 255)
    static let pressure = Color(red: 106 / 255, green: 27 / 255, blue: 154 / 255)
    static let wind = Color(red: 0, green: 131 / 255, blue: 143 / 255)
    static let windDir = Color(red: 243 / 255, green: 112 / 255, blue: 19 / 255)
}
