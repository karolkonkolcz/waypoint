import Foundation

extension WatchTrailOverview {
    /// Assemble the full-trail overview from local GRDB data. Fetches each
    /// stage's route once and downsamples geometry so the payload stays small
    /// enough for WatchConnectivity.
    static func build(
        trail: Trail,
        stages: [Stage],
        todayStageId: String?,
        routeRepo: RouteRepository = RouteRepository()
    ) -> WatchTrailOverview {
        let ordered = stages.sorted { $0.orderIndex < $1.orderIndex }
        var dayCounter = 0

        let summaries: [WatchStageSummary] = ordered.map { stage in
            let isTransit = stage.stageType == "transit"
            if !isTransit { dayCounter += 1 }

            let route = try? routeRepo.findByStage(stageId: stage.id)
            let line = route.flatMap { decodeLineString($0.geojson) }
            let profile = route.map { decodeElevationProfile($0.elevationProfile) } ?? []
            let difficulty = stage.computedDifficulty(paceKmh: trail.defaultPaceKmh)
            let etaHours = naismithHours(
                distanceKm: stage.distanceKm,
                ascentM: stage.ascentM,
                paceKmh: trail.defaultPaceKmh
            )
            let dateISO = stageDate(
                date: stage.date,
                orderIndex: stage.orderIndex,
                trailStartDate: trail.startDate
            )

            return WatchStageSummary(
                id: stage.id,
                dayNumber: isTransit ? nil : dayCounter,
                title: stageDisplayTitle(stage: stage, route: line, fallbackIndex: dayCounter),
                dateLabel: dateISO.map(formatStageDate),
                stageType: stage.stageType,
                isToday: stage.id == todayStageId,
                distanceKm: stage.distanceKm,
                ascentM: stage.ascentM,
                descentM: stage.descentM,
                etaMinutes: isTransit ? nil : Int((etaHours * 60).rounded()),
                difficultyLabel: WatchTodaySnapshot.localizedDifficulty(difficulty.klass.rawValue),
                difficultyClass: difficulty.klass.rawValue,
                routePolyline: downsamplePolyline(line?.coordinates ?? [], maxPoints: 40),
                routeProfile: downsampleProfile(profile, maxPoints: 28)
            )
        }

        return WatchTrailOverview(
            generatedAt: Date(),
            trailName: trail.name,
            stages: summaries
        )
    }

    private static func downsampleProfile(_ profile: [ElevationPoint], maxPoints: Int) -> [WatchRouteProfilePoint] {
        downsample(profile, maxPoints: maxPoints).map {
            WatchRouteProfilePoint(distanceKm: $0.dKm, elevationM: Int($0.eleM.rounded()))
        }
    }

    private static func downsamplePolyline(_ coords: [[Double]], maxPoints: Int) -> [[Double]] {
        let trimmed = downsample(coords, maxPoints: maxPoints)
        // Keep only [lon, lat]; drop any elevation third component.
        return trimmed.map { Array($0.prefix(2)) }
    }

    private static func downsample<T>(_ items: [T], maxPoints: Int) -> [T] {
        guard items.count > maxPoints, maxPoints > 2 else { return items }
        let step = Double(items.count - 1) / Double(maxPoints - 1)
        return (0 ..< maxPoints).map { items[Int((Double($0) * step).rounded())] }
    }
}
