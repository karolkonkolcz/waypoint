import Foundation
import GRDB

struct TodayDashboard: Sendable {
    var greeting: String
    var trail: Trail
    var stage: Stage
    var route: MapRoute?
    var weather: WeatherSnapshot?
    var todos: [Todo]
    var summary: String
    var direction: RouteDirection?
    var displayTitle: String
    var dateLabel: String?
    var dayNumber: Int
    var difficulty: DifficultyResult
    var elevationProfile: [ElevationPoint]
    var timeline: RouteTimeline?
    var startHour: Int
    var weatherPoint: Coord2?
    var isTransit: Bool
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

    /// MeteoAlarm warnings for today's stage (local-only cache).
    var alerts: CachedAlerts?
    var alertsLoading = false
    /// True while a start-hour change is re-projecting the day.
    var updatingStartHour = false

    private let trailRepo = TrailRepository()
    private let stageRepo = StageRepository()
    private let routeRepo = RouteRepository()
    private let weatherRepo = WeatherRepository()
    private let todoRepo = TodoRepository()
    private let waypointRepo = WaypointRepository()

    func load() async {
        if case .loaded = state { } else { state = .loading }
        await SyncEngine.shared.sync()
        reloadFromLocal()
        await refreshAlerts()
        await enrichDirection()
        await enrichWatchOverview()
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
                WatchSessionBridge.shared.send(snapshot: .unavailable(
                    title: hello,
                    subtitle: "Zatím nemáš žádnou trasu."
                ))
                state = .empty(hello)
                return
            }

            let stages = try stageRepo.findByTrail(trailId: activeTrail.id)
            guard let todayStage = stages.first(where: {
                stageDate(date: $0.date, orderIndex: $0.orderIndex, trailStartDate: activeTrail.startDate) == localToday()
            }) else {
                WatchSessionBridge.shared.send(snapshot: .unavailable(
                    title: activeTrail.name,
                    subtitle: "Na dnešek není naplánovaná žádná etapa."
                ))
                WatchSessionBridge.shared.send(overview: WatchTrailOverview.build(
                    trail: activeTrail,
                    stages: stages,
                    todayStageId: nil,
                    routeRepo: routeRepo
                ))
                state = .noStage(greeting: hello, trail: activeTrail)
                return
            }

            // Fetch the route once and derive everything from it.
            let routeRow = try? routeRepo.findByStage(stageId: todayStage.id)
            let line = routeRow.flatMap { decodeLineString($0.geojson) }
            let profile = routeRow.map { decodeElevationProfile($0.elevationProfile) } ?? []
            let startHour = startHour(preferencesJson: activeTrail.preferences)
            let isTransit = todayStage.stageType == "transit"

            let weather = makeWeatherSnapshot(stage: todayStage, line: line, profile: profile, trail: activeTrail, startHour: startHour)
            let direction = stageDirection(stage: todayStage, route: line)
            let difficulty = todayStage.computedDifficulty(paceKmh: activeTrail.defaultPaceKmh)
            let waypoints = (try? waypointRepo.findByTrail(trailId: activeTrail.id)) ?? []

            let timeline: RouteTimeline? = (isTransit || profile.count < 2) ? nil : buildRouteTimeline(
                profile: profile,
                waypoints: waypoints,
                paceKmh: activeTrail.defaultPaceKmh,
                startHour: startHour,
                startName: direction?.start ?? "Start",
                destinationName: direction?.destination ?? "Cíl",
                snapshot: weather
            )

            // Day number = count of trek stages up to and including today.
            let dayNumber: Int
            if let idx = stages.firstIndex(where: { $0.id == todayStage.id }) {
                dayNumber = stages[...idx].filter { $0.stageType != "transit" }.count
            } else {
                dayNumber = todayStage.orderIndex + 1
            }

            let dashboard = TodayDashboard(
                greeting: hello,
                trail: activeTrail,
                stage: todayStage,
                route: makeMapRoute(stage: todayStage, line: line),
                weather: weather,
                todos: try todoRepo.findByTrail(trailId: activeTrail.id),
                summary: buildDaySummary(stage: todayStage, snapshot: weather),
                direction: direction,
                displayTitle: stageDisplayTitle(stage: todayStage, route: line, fallbackIndex: dayNumber),
                dateLabel: stageDate(date: todayStage.date, orderIndex: todayStage.orderIndex, trailStartDate: activeTrail.startDate).map(formatStageDate),
                dayNumber: dayNumber,
                difficulty: difficulty,
                elevationProfile: profile,
                timeline: timeline,
                startHour: startHour,
                weatherPoint: weatherPoint(stage: todayStage, line: line),
                isTransit: isTransit
            )
            WatchSessionBridge.shared.send(snapshot: WatchTodaySnapshot(dashboard: dashboard))
            WatchSessionBridge.shared.send(overview: WatchTrailOverview.build(
                trail: activeTrail,
                stages: stages,
                todayStageId: todayStage.id,
                routeRepo: routeRepo
            ))
            state = .loaded(dashboard)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Persist a new departure hour and re-project the whole day locally
    /// (timeline + moving-weather phases) from the cached samples — no network.
    func changeStartHour(_ hour: Int) {
        guard case .loaded(let dashboard) = state, hour >= 0, hour <= 23 else { return }
        updatingStartHour = true
        defer { updatingStartHour = false }
        do {
            _ = try trailRepo.update(id: dashboard.trail.id) { trail in
                trail.preferences = setStartHour(trail.preferences, hour: hour)
            }
            reloadFromLocal()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Fetch MeteoAlarm warnings for today's weather point.
    func refreshAlerts() async {
        guard case .loaded(let dashboard) = state, let point = dashboard.weatherPoint else { return }
        if alerts == nil { alertsLoading = true }
        alerts = await AlertsRepository.shared.refresh(trailId: dashboard.trail.id, lat: point.lat, lon: point.lon)
        alertsLoading = false
    }

    /// Upgrade coordinate-only direction endpoints to place names.
    func enrichDirection() async {
        guard case .loaded(let dashboard) = state,
              let direction = dashboard.direction,
              let line = dashboard.route?.line,
              let first = line.coordinates.first, let last = line.coordinates.last,
              isCoordinateLabel(direction.start) || isCoordinateLabel(direction.destination)
        else { return }

        async let startName = PlaceNameService.shared.name(lat: first[1], lon: first[0])
        async let destName = PlaceNameService.shared.name(lat: last[1], lon: last[0])
        let upgraded = direction.upgrading(start: await startName, destination: await destName)

        guard upgraded != direction, case .loaded(var current) = state else { return }
        current.direction = upgraded
        // The timeline ("Kde budeš v kolik") baked in the coordinate labels at
        // build time; relabel its endpoints so they track the upgraded names.
        current.timeline = current.timeline?.relabelEndpoints(
            start: upgraded.start, destination: upgraded.destination
        )
        state = .loaded(current)
        // The watch snapshot was sent during reloadFromLocal() with the raw
        // coordinate labels; resend it now that the names are resolved.
        WatchSessionBridge.shared.send(snapshot: WatchTodaySnapshot(dashboard: current))
    }

    /// The watch overview's stage browser shows a "Start → Cíl" title per stage.
    /// Stages without their own title fall back to a coordinate label, which —
    /// unlike the iOS screen — is never enriched. Resolve those to place names
    /// (cached) and resend the overview so the watch matches the phone.
    func enrichWatchOverview() async {
        guard case .loaded(let dashboard) = state,
              let stages = try? stageRepo.findByTrail(trailId: dashboard.trail.id),
              !stages.isEmpty
        else { return }

        var overview = WatchTrailOverview.build(
            trail: dashboard.trail, stages: stages,
            todayStageId: dashboard.stage.id, routeRepo: routeRepo
        )
        var changed = false
        for index in overview.stages.indices {
            let summary = overview.stages[index]
            let parts = summary.title
                .components(separatedBy: "→")
                .map { $0.trimmingCharacters(in: .whitespaces) }
            guard parts.count == 2, parts.allSatisfy(isCoordinateLabel),
                  let first = summary.routePolyline.first, let last = summary.routePolyline.last,
                  first.count >= 2, last.count >= 2
            else { continue }

            async let start = PlaceNameService.shared.name(lat: first[1], lon: first[0])
            async let dest = PlaceNameService.shared.name(lat: last[1], lon: last[0])
            let resolvedStart = await start ?? parts[0]
            let resolvedDest = await dest ?? parts[1]
            let upgraded = "\(resolvedStart) → \(resolvedDest)"
            if upgraded != summary.title {
                overview.stages[index].title = upgraded
                changed = true
            }
        }
        if changed { WatchSessionBridge.shared.send(overview: overview) }
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

    private func makeMapRoute(stage: Stage, line: LineString?) -> MapRoute? {
        guard let line, let route = try? routeRepo.findByStage(stageId: stage.id) else { return nil }
        return MapRoute(
            id: route.id,
            line: line,
            color: mapRouteColor(for: stage.difficultyClass),
            title: stage.title
        )
    }

    private func makeWeatherSnapshot(stage: Stage, line: LineString?, profile: [ElevationPoint], trail: Trail, startHour: Int) -> WeatherSnapshot? {
        guard let rows = try? weatherRepo.findByStage(stageId: stage.id) else { return nil }
        let samples = decodeWeatherSamples(rows)
        guard !samples.isEmpty else { return nil }

        return buildRouteWeatherSnapshot(
            samples: samples,
            route: line,
            elevationProfile: profile,
            paceKmh: trail.defaultPaceKmh,
            startHour: startHour,
            date: samples[0].date
        )
    }

    /// Coordinate used for weather/alerts: route midpoint, else the stage anchor.
    private func weatherPoint(stage: Stage, line: LineString?) -> Coord2? {
        if stage.stageType == "transit" {
            if let lat = stage.locationLat, let lon = stage.locationLon { return (lon: lon, lat: lat) }
            return nil
        }
        if let line { return pointAtDistance(line, totalDistance(line) / 2) }
        return nil
    }

    /// Merge a new `start_hour` into the trail's preferences JSON.
    private func setStartHour(_ preferencesJson: String, hour: Int) -> String {
        var object = (preferencesJson.data(using: .utf8)
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }) ?? [:]
        object["start_hour"] = hour
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let json = String(data: data, encoding: .utf8) else { return preferencesJson }
        return json
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
}
