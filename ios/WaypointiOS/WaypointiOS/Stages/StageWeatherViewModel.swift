import Foundation

@MainActor
@Observable
final class StageWeatherViewModel {
    enum State {
        case idle
        case loading
        case unavailable(String)
        case loaded(WeatherSnapshot, fetchedAt: Date, isStale: Bool, isRefreshing: Bool, message: String?)
    }

    var state: State = .idle

    private let weatherRepo = WeatherRepository()
    private let routeRepo = RouteRepository()
    private let client = OpenMeteoClient()

    func load(stage: Stage, trail: Trail) async {
        let cached = (try? weatherRepo.findByStage(stageId: stage.id)) ?? []
        let isFresh = weatherRepo.isFresh(cached)

        if let snapshot = makeSnapshot(rows: cached, stage: stage, trail: trail), let fetchedAt = cached.map(\.fetchedAt).max() {
            state = .loaded(snapshot, fetchedAt: fetchedAt, isStale: !isFresh, isRefreshing: !isFresh, message: nil)
        } else {
            state = .loading
        }

        guard !isFresh else { return }
        await refresh(stage: stage, trail: trail)
    }

    func refresh(stage: Stage, trail: Trail) async {
        switch state {
        case .loaded(let snapshot, let fetchedAt, let isStale, _, let message):
            state = .loaded(snapshot, fetchedAt: fetchedAt, isStale: isStale, isRefreshing: true, message: message)
        default:
            state = .loading
        }

        do {
            guard let date = stageDate(date: stage.date, orderIndex: stage.orderIndex, trailStartDate: trail.startDate) else {
                throw StageWeatherError.missingDate
            }

            let plan = try makeSamplingPlan(stage: stage)
            let endDate = plan.includeNight ? nextDate(date) : date
            let results = try await client.fetch(points: plan.points, date: date, endDate: endDate)
            let inputs = zip(plan.points.indices, results).map { index, result in
                WeatherRepository.SaveSampleInput(
                    trailId: trail.id,
                    stageId: stage.id,
                    userId: stage.userId,
                    latitude: result.latitude,
                    longitude: result.longitude,
                    date: date,
                    sample: WeatherSampleCache(
                        sampleIndex: index,
                        distanceKm: plan.distanceKms[index],
                        date: date,
                        result: result
                    )
                )
            }

            let rows = try weatherRepo.saveSamples(inputs)
            if let snapshot = makeSnapshot(rows: rows, stage: stage, trail: trail), let fetchedAt = rows.map(\.fetchedAt).max() {
                state = .loaded(snapshot, fetchedAt: fetchedAt, isStale: false, isRefreshing: false, message: nil)
            } else {
                state = .unavailable("Počasí se nepodařilo uložit.")
            }
        } catch {
            let message = errorMessage(error)
            switch state {
            case .loaded(let snapshot, let fetchedAt, let isStale, _, _):
                state = .loaded(snapshot, fetchedAt: fetchedAt, isStale: isStale, isRefreshing: false, message: message)
            default:
                state = .unavailable(message)
            }
        }
    }

    private func makeSnapshot(rows: [WeatherRow], stage: Stage, trail: Trail) -> WeatherSnapshot? {
        let samples = decodeWeatherSamples(rows)
        guard !samples.isEmpty else { return nil }

        let route = try? routeRepo.findByStage(stageId: stage.id)
        let line = route.flatMap { decodeLineString($0.geojson) }
        let profile = route.map { decodeElevationProfile($0.elevationProfile) } ?? []
        return buildRouteWeatherSnapshot(
            samples: samples,
            route: line,
            elevationProfile: profile,
            paceKmh: trail.defaultPaceKmh,
            startHour: startHour(preferencesJson: trail.preferences),
            date: samples[0].date
        )
    }

    private func makeSamplingPlan(stage: Stage) throws -> SamplingPlan {
        if stage.stageType == "transit" {
            guard let lat = stage.locationLat, let lon = stage.locationLon else {
                throw StageWeatherError.missingAnchor
            }
            return SamplingPlan(points: [(lon, lat)], distanceKms: [0], includeNight: false)
        }

        if
            let route = try routeRepo.findByStage(stageId: stage.id),
            let line = decodeLineString(route.geojson)
        {
            let count = max(2, min(6, Int(ceil(route.totalDistanceKm / 5))))
            let points = samplePoints(line, n: count)
            let total = totalDistance(line)
            let distances = points.indices.map { index in
                count == 1 ? 0 : Double(index) / Double(count - 1) * total
            }
            return SamplingPlan(points: points, distanceKms: distances, includeNight: true)
        }

        guard let lat = stage.locationLat, let lon = stage.locationLon else {
            throw StageWeatherError.missingAnchor
        }
        return SamplingPlan(points: [(lon, lat)], distanceKms: [0], includeNight: false)
    }

    private func startHour(preferencesJson: String) -> Int {
        guard
            let data = preferencesJson.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let value = object["start_hour"] as? Int,
            value >= 0,
            value <= 23
        else { return 8 }
        return value
    }

    private func nextDate(_ yyyyMmDd: String) -> String {
        guard let date = WeatherDate.utcDay(yyyyMmDd) else { return yyyyMmDd }
        let next = Calendar(identifier: .gregorian).date(byAdding: .day, value: 1, to: date) ?? date
        return WeatherDate.formatUtcDay(next)
    }

    private func errorMessage(_ error: Error) -> String {
        switch error {
        case StageWeatherError.missingDate:
            return "Etapa nemá datum pro předpověď."
        case StageWeatherError.missingAnchor:
            return "Etapa nemá trasu ani místo pro výpočet počasí."
        default:
            return "Počasí teď nejde stáhnout. Zobrazuji poslední uloženou verzi, pokud existuje."
        }
    }
}

private struct SamplingPlan {
    var points: [Coord2]
    var distanceKms: [Double]
    var includeNight: Bool
}

private enum StageWeatherError: Error {
    case missingDate
    case missingAnchor
}

private enum WeatherDate {
    static func utcDay(_ yyyyMmDd: String) -> Date? {
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

    static func formatUtcDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
