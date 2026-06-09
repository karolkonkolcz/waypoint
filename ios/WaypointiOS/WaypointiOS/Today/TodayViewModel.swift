import Foundation
import GRDB

struct TodayDashboard: Sendable {
    var greeting: String
    var trail: Trail
    var stage: Stage
    var route: MapRoute?
    var routeLine: LineString?
    var elevationProfile: [ElevationPoint]
    var waypoints: [Waypoint]
    var weather: WeatherSnapshot?
    var startHour: Int
    var todos: [Todo]
    var summary: String
}

@MainActor
@Observable
final class TodayViewModel {
    enum State {
        case idle
        case loading
        case empty(String)
        case noStage(greeting: String, trail: Trail)
        case loaded(TodayDashboard)
        case failed(String)
    }

    var state: State = .idle
    var newTodoText = ""

    private let trailRepo = TrailRepository()
    private let stageRepo = StageRepository()
    private let routeRepo = RouteRepository()
    private let weatherRepo = WeatherRepository()
    private let todoRepo = TodoRepository()

    func load() async {
        if case .loaded = state { } else { state = .loading }
        await SyncEngine.shared.sync()
        reloadFromLocal()
    }

    func reloadFromLocal() {
        do {
            let trails = try localTrails()
            let hello = greeting()
            guard let activeTrail = resolveActiveTrail(
                trails: trails,
                stageCountByTrail: try stageCounts(for: trails),
                today: localToday()
            ) else {
                state = .empty(hello)
                return
            }

            let stages = try stageRepo.findByTrail(trailId: activeTrail.id)
            guard let todayStage = stages.first(where: {
                stageDate(date: $0.date, orderIndex: $0.orderIndex, trailStartDate: activeTrail.startDate) == localToday()
            }) else {
                state = .noStage(greeting: hello, trail: activeTrail)
                return
            }

            let routeRow = try? routeRepo.findByStage(stageId: todayStage.id)
            let routeLine = routeRow.flatMap { decodeLineString($0.geojson) }
            let elevationProfile = routeRow.map { decodeElevationProfile($0.elevationProfile) } ?? []
            let startHour = startHour(preferencesJson: activeTrail.preferences)
            let weather = makeWeatherSnapshot(
                stage: todayStage,
                trail: activeTrail,
                line: routeLine,
                elevationProfile: elevationProfile,
                startHour: startHour
            )
            let dashboard = TodayDashboard(
                greeting: hello,
                trail: activeTrail,
                stage: todayStage,
                route: makeMapRoute(stage: todayStage, route: routeRow, line: routeLine),
                routeLine: routeLine,
                elevationProfile: elevationProfile,
                waypoints: try waypointsForTrail(activeTrail.id),
                weather: weather,
                startHour: startHour,
                todos: try todoRepo.findByTrail(trailId: activeTrail.id),
                summary: buildDaySummary(stage: todayStage, snapshot: weather)
            )
            state = .loaded(dashboard)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func addTodo() {
        guard case .loaded(let dashboard) = state else { return }
        let text = newTodoText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        do {
            _ = try todoRepo.add(.init(
                userId: dashboard.trail.userId,
                trailId: dashboard.trail.id,
                text: text,
                stageId: dashboard.stage.id
            ))
            newTodoText = ""
            reloadFromLocal()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func toggleTodo(_ todo: Todo) {
        do {
            _ = try todoRepo.toggle(id: todo.id)
            reloadFromLocal()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func removeTodo(_ todo: Todo) {
        do {
            try todoRepo.remove(id: todo.id)
            reloadFromLocal()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func updateStartHour(_ hour: Int) {
        guard case .loaded(let dashboard) = state else { return }
        do {
            _ = try trailRepo.update(id: dashboard.trail.id) { trail in
                trail.preferences = preferencesJson(updating: trail.preferences, startHour: hour)
            }
            reloadFromLocal()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func localTrails() throws -> [Trail] {
        try AppDatabase.shared.dbPool.read { db in
            try Trail
                .filter(Column("deleted_at") == nil)
                .order(Column("created_at").desc)
                .fetchAll(db)
        }
    }

    private func stageCounts(for trails: [Trail]) throws -> [String: Int] {
        var result: [String: Int] = [:]
        for trail in trails {
            result[trail.id] = try stageRepo.findByTrail(trailId: trail.id).count
        }
        return result
    }

    private func makeMapRoute(stage: Stage, route: Route?, line: LineString?) -> MapRoute? {
        guard
            let route,
            let line
        else { return nil }

        return MapRoute(
            id: route.id,
            line: line,
            color: mapRouteColor(for: stage.difficultyClass),
            title: stageDisplayTitle(stage: stage, line: line)
        )
    }

    private func makeWeatherSnapshot(
        stage: Stage,
        trail: Trail,
        line: LineString?,
        elevationProfile: [ElevationPoint],
        startHour: Int
    ) -> WeatherSnapshot? {
        guard let rows = try? weatherRepo.findByStage(stageId: stage.id) else { return nil }
        let samples = decodeWeatherSamples(rows)
        guard !samples.isEmpty else { return nil }

        return buildRouteWeatherSnapshot(
            samples: samples,
            route: line,
            elevationProfile: elevationProfile,
            paceKmh: trail.defaultPaceKmh,
            startHour: startHour,
            date: samples[0].date
        )
    }

    private func waypointsForTrail(_ trailId: String) throws -> [Waypoint] {
        try AppDatabase.shared.dbPool.read { db in
            try Waypoint
                .filter(Column("trail_id") == trailId && Column("deleted_at") == nil)
                .order(Column("distance_along_route_km").asc)
                .fetchAll(db)
        }
    }

    private func startHour(preferencesJson: String) -> Int {
        guard
            let data = preferencesJson.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let value = object["start_hour"] as? Int,
            value >= 0,
            value < 24
        else { return 8 }
        return value
    }

    private func preferencesJson(updating json: String, startHour: Int) -> String {
        var object: [String: Any] = [:]
        if
            let data = json.data(using: .utf8),
            let decoded = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        {
            object = decoded
        }
        object["start_hour"] = max(0, min(23, startHour))
        guard
            JSONSerialization.isValidJSONObject(object),
            let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]),
            let encoded = String(data: data, encoding: .utf8)
        else { return json }
        return encoded
    }
}
