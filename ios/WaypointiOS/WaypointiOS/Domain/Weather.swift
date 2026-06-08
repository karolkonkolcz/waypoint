import Foundation

struct HourlyForecast: Codable, Sendable {
    var time: [String]
    var temperature2m: [Double]
    var precipitation: [Double]
    var windspeed10m: [Double]
    var weathercode: [Int]

    enum CodingKeys: String, CodingKey {
        case time
        case temperature2m = "temperature_2m"
        case precipitation
        case windspeed10m = "windspeed_10m"
        case weathercode
    }
}

struct OpenMeteoResult: Codable, Sendable {
    var latitude: Double
    var longitude: Double
    var hourly: HourlyForecast
}

struct WeatherSampleCache: Codable, Sendable {
    var sampleIndex: Int
    var distanceKm: Double
    var date: String
    var result: OpenMeteoResult
}

enum WeatherCondition: String, Codable, Sendable {
    case clear
    case partlyCloudy = "partly-cloudy"
    case cloudy
    case fog
    case drizzle
    case rain
    case snow
    case storm
}

struct WeatherEntry: Identifiable, Codable, Sendable {
    var id: Int { hour }
    var hour: Int
    var tempC: Int
    var precipMm: Double
    var windKmh: Int
    var condition: WeatherCondition
}

enum ForecastPhase: String, Codable, Sendable {
    case start
    case moving
    case end
}

struct MovingWeatherEntry: Identifiable, Codable, Sendable {
    var id: Int { hour }
    var hour: Int
    var km: Double
    var lat: Double
    var lon: Double
    var tempC: Int
    var precipMm: Double
    var windKmh: Int
    var condition: WeatherCondition
    var phase: ForecastPhase
}

struct WeatherSnapshot: Codable, Sendable {
    var date: String
    var latitude: Double
    var longitude: Double
    var entries: [WeatherEntry]
    var precipTotalMm: Double
    var windMaxKmh: Int
    var moving: [MovingWeatherEntry]?
    var startHour: Int?
    var arrivalHour: Int?
    var rainStartsHour: Int?
    var rainStartsKm: Double?
}

private let displayHours = [8, 12, 16]
private let hikeStart = 6
private let hikeEnd = 18
private let dayStart = 6
private let nightEnd = 30

func buildWeatherSnapshot(_ result: OpenMeteoResult, date: String) -> WeatherSnapshot {
    let hourly = result.hourly
    var byHour: [Int: Int] = [:]
    for (index, time) in hourly.time.enumerated() where String(time.prefix(10)) == date {
        byHour[hourOf(time)] = index
    }

    let entries = displayHours.map { hour in
        makeWeatherEntry(hour: hour, index: byHour[hour] ?? 0, hourly: hourly)
    }

    var precipSum = 0.0
    var windMax = 0.0
    for (hour, index) in byHour where hour >= hikeStart && hour <= hikeEnd {
        precipSum += hourly.precipitation[safe: index] ?? 0
        windMax = max(windMax, hourly.windspeed10m[safe: index] ?? 0)
    }

    return WeatherSnapshot(
        date: date,
        latitude: result.latitude,
        longitude: result.longitude,
        entries: entries,
        precipTotalMm: roundedTenths(precipSum),
        windMaxKmh: Int(windMax.rounded()),
        moving: nil,
        startHour: nil,
        arrivalHour: nil,
        rainStartsHour: nil,
        rainStartsKm: nil
    )
}

func buildRouteWeatherSnapshot(
    samples: [WeatherSampleCache],
    route: LineString?,
    elevationProfile: [ElevationPoint],
    paceKmh: Double,
    startHour: Int,
    date: String
) -> WeatherSnapshot? {
    let ordered = samples.sorted { $0.sampleIndex < $1.sampleIndex }
    guard let midpoint = ordered[safe: max(0, (ordered.count - 1) / 2)] else { return nil }
    var base = buildWeatherSnapshot(midpoint.result, date: date)

    guard
        let route,
        ordered.count >= 2,
        elevationProfile.count >= 2
    else { return base }

    let total = totalDistance(route)
    let sampleKms = ordered.map(\.distanceKm)
    let readers = ordered.map { IndexedWeatherResult(result: $0.result, date: date) }
    let profile = cumulativeTimeProfile(profile: elevationProfile, paceKmh: paceKmh)
    let arrivalHour = min(nightEnd, startHour + Int(ceil(totalEtaHours(profile: profile))))

    let start = pointAtDistance(route, 0)
    let end = pointAtDistance(route, total)
    var moving: [MovingWeatherEntry] = []

    for hour in min(dayStart, startHour) ... nightEnd {
        if hour < startHour {
            moving.append(makeMoving(hour: hour, km: 0, point: start, phase: .start, weather: readers[0].at(hour)))
        } else if hour <= arrivalHour {
            let km = kmAtElapsed(profile: profile, elapsedH: Double(hour - startHour))
            let sampleIndex = nearestSampleIndex(sampleKms: sampleKms, km: km)
            moving.append(
                makeMoving(
                    hour: hour,
                    km: roundedTenths(km),
                    point: pointAtDistance(route, km),
                    phase: .moving,
                    weather: readers[sampleIndex].at(hour)
                )
            )
        } else {
            moving.append(makeMoving(hour: hour, km: roundedTenths(total), point: end, phase: .end, weather: readers[readers.count - 1].at(hour)))
        }
    }

    let firstWet = moving.first { $0.phase == .moving && $0.precipMm > 0 }
    base.moving = moving
    base.startHour = startHour
    base.arrivalHour = arrivalHour
    base.rainStartsHour = firstWet?.hour
    base.rainStartsKm = firstWet?.km
    return base
}

func decodeWeatherSamples(_ rows: [WeatherRow]) -> [WeatherSampleCache] {
    let decoder = JSONDecoder()
    return rows.compactMap { row in
        guard let data = row.forecastJson.data(using: .utf8) else { return nil }
        return try? decoder.decode(WeatherSampleCache.self, from: data)
    }
}

func decodeLineString(_ json: String) -> LineString? {
    struct GeoJSONLineString: Decodable {
        var type: String
        var coordinates: [[Double]]
    }
    guard
        let data = json.data(using: .utf8),
        let decoded = try? JSONDecoder().decode(GeoJSONLineString.self, from: data),
        decoded.type == "LineString",
        decoded.coordinates.count >= 2
    else { return nil }
    return LineString(coordinates: decoded.coordinates)
}

func decodeElevationProfile(_ json: String) -> [ElevationPoint] {
    struct RawElevationPoint: Decodable {
        var dKm: Double
        var eleM: Double

        enum CodingKeys: String, CodingKey {
            case dKm = "d_km"
            case eleM = "ele_m"
        }
    }
    guard
        let data = json.data(using: .utf8),
        let decoded = try? JSONDecoder().decode([RawElevationPoint].self, from: data)
    else { return [] }
    return decoded.map { ElevationPoint(dKm: $0.dKm, eleM: $0.eleM) }
}

func weatherConditionLabel(_ condition: WeatherCondition) -> String {
    switch condition {
    case .clear: return "Jasno"
    case .partlyCloudy: return "Polojasno"
    case .cloudy: return "Oblačno"
    case .fog: return "Mlha"
    case .drizzle: return "Mrholení"
    case .rain: return "Déšť"
    case .snow: return "Sníh"
    case .storm: return "Bouřky"
    }
}

private struct IndexedWeatherResult {
    private let hourly: HourlyForecast
    private let byHour: [Int: Int]
    private let maxHour: Int

    init(result: OpenMeteoResult, date: String) {
        hourly = result.hourly
        var map: [Int: Int] = [:]
        var maxSeen = 0
        for (index, time) in result.hourly.time.enumerated() {
            let hour = absoluteHourOf(time, date: date)
            map[hour] = index
            maxSeen = max(maxSeen, hour)
        }
        byHour = map
        maxHour = maxSeen
    }

    func at(_ absoluteHour: Int) -> WeatherEntry {
        let index = byHour[absoluteHour] ?? byHour[min(absoluteHour, maxHour)] ?? 0
        return makeWeatherEntry(hour: absoluteHour, index: index, hourly: hourly)
    }
}

private func makeWeatherEntry(hour: Int, index: Int, hourly: HourlyForecast) -> WeatherEntry {
    WeatherEntry(
        hour: hour,
        tempC: Int((hourly.temperature2m[safe: index] ?? 0).rounded()),
        precipMm: roundedTenths(hourly.precipitation[safe: index] ?? 0),
        windKmh: Int((hourly.windspeed10m[safe: index] ?? 0).rounded()),
        condition: wmoCondition(hourly.weathercode[safe: index] ?? 0)
    )
}

private func makeMoving(
    hour: Int,
    km: Double,
    point: Coord2,
    phase: ForecastPhase,
    weather: WeatherEntry
) -> MovingWeatherEntry {
    MovingWeatherEntry(
        hour: hour,
        km: km,
        lat: point.lat,
        lon: point.lon,
        tempC: weather.tempC,
        precipMm: weather.precipMm,
        windKmh: weather.windKmh,
        condition: weather.condition,
        phase: phase
    )
}

private func nearestSampleIndex(sampleKms: [Double], km: Double) -> Int {
    var selected = 0
    var best = Double.infinity
    for (index, sampleKm) in sampleKms.enumerated() {
        let distance = abs(sampleKm - km)
        if distance < best {
            best = distance
            selected = index
        }
    }
    return selected
}

private func wmoCondition(_ code: Int) -> WeatherCondition {
    if code <= 1 { return .clear }
    if code == 2 { return .partlyCloudy }
    if code == 3 { return .cloudy }
    if code == 45 || code == 48 { return .fog }
    if code >= 51 && code <= 57 { return .drizzle }
    if (code >= 61 && code <= 67) || (code >= 80 && code <= 82) { return .rain }
    if (code >= 71 && code <= 77) || code == 85 || code == 86 { return .snow }
    if code >= 95 { return .storm }
    return .cloudy
}

private func hourOf(_ time: String) -> Int {
    Int(time.dropFirst(11).prefix(2)) ?? 0
}

private func absoluteHourOf(_ time: String, date: String) -> Int {
    let hour = hourOf(time)
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

private func roundedTenths(_ value: Double) -> Double {
    (value * 10).rounded() / 10
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        guard indices.contains(index) else { return nil }
        return self[index]
    }
}
