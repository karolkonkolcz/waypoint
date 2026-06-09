import Foundation

/// Normalized hourly series the `MeteogramView` renders — the Swift mirror of
/// the web `MeteogramData` type (web/lib/weather/types.ts). Each panel draws
/// only when its series is present, so the same view serves both the full live
/// path (every series filled from a `RichForecast`) and the limited offline
/// path (temperature / precipitation / wind from a cached `OpenMeteoResult`).
struct MeteogramSeries: Sendable {
    /// X axis: one `Date` per hour.
    var time: [Date]
    var temperature: [Double]?
    /// Daily min/max band, expanded onto the hourly X axis (step-filled).
    var tempMin: [Double]?
    var tempMax: [Double]?
    var cloudLow: [Double]?
    var cloudMid: [Double]?
    var cloudHigh: [Double]?
    var rain: [Double]?
    var snow: [Double]?
    var pressure: [Double]?
    var windSpeed: [Double]?
    var windGusts: [Double]?
    var windDir: [Double]?
    /// When true, the view shows a "limited offline data" note.
    var limited: Bool = false
}

/// Richer Open-Meteo response for the current-position meteogram. Mirrors the
/// 12 hourly variables + daily min/max the web `/weather` page requests — a
/// superset of the trail-weather `OpenMeteoResult` (temperature/precip/wind).
struct RichForecast: Codable, Sendable {
    struct Hourly: Codable, Sendable {
        var time: [String]
        var temperature2m: [Double]
        var cloudCoverLow: [Double]
        var cloudCoverMid: [Double]
        var cloudCoverHigh: [Double]
        var rain: [Double]
        var snowfall: [Double]
        var pressureMsl: [Double]
        var windSpeed10m: [Double]
        var windGusts10m: [Double]
        var windDirection10m: [Double]

        enum CodingKeys: String, CodingKey {
            case time
            case temperature2m = "temperature_2m"
            case cloudCoverLow = "cloud_cover_low"
            case cloudCoverMid = "cloud_cover_mid"
            case cloudCoverHigh = "cloud_cover_high"
            case rain
            case snowfall
            case pressureMsl = "pressure_msl"
            case windSpeed10m = "wind_speed_10m"
            case windGusts10m = "wind_gusts_10m"
            case windDirection10m = "wind_direction_10m"
        }
    }

    struct Daily: Codable, Sendable {
        var time: [String]
        var temperature2mMax: [Double]
        var temperature2mMin: [Double]

        enum CodingKeys: String, CodingKey {
            case time
            case temperature2mMax = "temperature_2m_max"
            case temperature2mMin = "temperature_2m_min"
        }
    }

    var latitude: Double
    var longitude: Double
    var hourly: Hourly
    var daily: Daily
}

/// Open-Meteo local-time stamps look like "2026-06-09T08:00" (no zone suffix
/// when `timezone=auto`). Parse them in a fixed UTC calendar so chart ticks and
/// day-boundary labels stay self-consistent with the rendered wall-clock hour.
private let meteogramISOFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
    return formatter
}()

func parseMeteogramDate(_ time: String) -> Date? {
    meteogramISOFormatter.date(from: time)
}

/// Adapt a full `RichForecast` into the normalized series — every panel filled.
/// The daily min/max band is expanded onto the hourly X axis so the temperature
/// panel can fill it behind the hourly line (mirrors `forecastToMeteogram` in
/// web/lib/weather/current-position.ts).
func forecastToMeteogram(_ forecast: RichForecast, hourLimit: Int? = nil) -> MeteogramSeries {
    let hourly = forecast.hourly
    let dates = hourly.time.map { parseMeteogramDate($0) ?? Date(timeIntervalSince1970: 0) }

    var dayMin: [String: Double] = [:]
    var dayMax: [String: Double] = [:]
    for (index, day) in forecast.daily.time.enumerated() {
        dayMin[day] = forecast.daily.temperature2mMin[safe: index]
        dayMax[day] = forecast.daily.temperature2mMax[safe: index]
    }
    let fallback = hourly.temperature2m.first ?? 0
    let tempMin = hourly.time.map { dayMin[String($0.prefix(10))] ?? fallback }
    let tempMax = hourly.time.map { dayMax[String($0.prefix(10))] ?? fallback }

    let series = MeteogramSeries(
        time: dates,
        temperature: hourly.temperature2m,
        tempMin: tempMin,
        tempMax: tempMax,
        cloudLow: hourly.cloudCoverLow,
        cloudMid: hourly.cloudCoverMid,
        cloudHigh: hourly.cloudCoverHigh,
        rain: hourly.rain,
        snow: hourly.snowfall,
        pressure: hourly.pressureMsl,
        windSpeed: hourly.windSpeed10m,
        windGusts: hourly.windGusts10m,
        windDir: hourly.windDirection10m,
        limited: false
    )
    return hourLimit.map { series.prefixHours($0) } ?? series
}

/// Build a limited series from a cached trail-weather `OpenMeteoResult` (only
/// temperature / precipitation / wind available). Used for the offline fallback
/// and the stage-detail meteogram, mirroring the web "limited" mode.
func limitedMeteogramSeries(from result: OpenMeteoResult, date: String? = nil, hourLimit: Int? = nil) -> MeteogramSeries {
    let hourly = result.hourly
    let indices = meteogramIndices(times: hourly.time, date: date, hourLimit: hourLimit)
    let dates = indices.map { parseMeteogramDate(hourly.time[$0]) ?? Date(timeIntervalSince1970: 0) }
    return MeteogramSeries(
        time: dates,
        temperature: hourly.temperature2m.values(at: indices),
        rain: hourly.precipitation.values(at: indices),
        windSpeed: hourly.windspeed10m.values(at: indices),
        limited: true
    )
}

private func meteogramIndices(times: [String], date: String?, hourLimit: Int?) -> [Int] {
    let limit = hourLimit ?? Int.max
    guard let date else {
        return Array(times.indices.prefix(limit))
    }
    return times.indices.filter { index in
        let offset = hourOffset(times[index], from: date)
        return offset >= 0 && offset < limit
    }
}

private func hourOffset(_ time: String, from date: String) -> Int {
    let hour = Int(time.dropFirst(11).prefix(2)) ?? 0
    guard
        let base = utcDay(date),
        let current = utcDay(String(time.prefix(10)))
    else { return hour }
    let dayOffset = Int(current.timeIntervalSince(base) / 86_400)
    return dayOffset * 24 + hour
}

private func utcDay(_ yyyyMmDd: String) -> Date? {
    var components = DateComponents()
    components.calendar = Calendar(identifier: .gregorian)
    components.timeZone = TimeZone(secondsFromGMT: 0)
    let parts = yyyyMmDd.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    components.year = parts[0]
    components.month = parts[1]
    components.day = parts[2]
    return components.date
}

private extension MeteogramSeries {
    func prefixHours(_ count: Int) -> MeteogramSeries {
        let upperBound = min(max(count, 0), time.count)
        return MeteogramSeries(
            time: Array(time.prefix(upperBound)),
            temperature: temperature?.prefixArray(upperBound),
            tempMin: tempMin?.prefixArray(upperBound),
            tempMax: tempMax?.prefixArray(upperBound),
            cloudLow: cloudLow?.prefixArray(upperBound),
            cloudMid: cloudMid?.prefixArray(upperBound),
            cloudHigh: cloudHigh?.prefixArray(upperBound),
            rain: rain?.prefixArray(upperBound),
            snow: snow?.prefixArray(upperBound),
            pressure: pressure?.prefixArray(upperBound),
            windSpeed: windSpeed?.prefixArray(upperBound),
            windGusts: windGusts?.prefixArray(upperBound),
            windDir: windDir?.prefixArray(upperBound),
            limited: limited
        )
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }

    func values(at selectedIndices: [Int]) -> [Element] {
        selectedIndices.compactMap { self[safe: $0] }
    }

    func prefixArray(_ count: Int) -> [Element] {
        Array(prefix(count))
    }
}
