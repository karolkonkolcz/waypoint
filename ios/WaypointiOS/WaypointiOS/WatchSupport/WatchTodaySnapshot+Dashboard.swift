import Foundation

extension WatchTodaySnapshot {
    init(dashboard: TodayDashboard) {
        let etaHours = naismithHours(
            distanceKm: dashboard.stage.distanceKm,
            ascentM: dashboard.stage.ascentM,
            paceKmh: dashboard.trail.defaultPaceKmh
        )
        let midday = dashboard.weather?.entries.first(where: { $0.hour == 12 })
            ?? dashboard.weather?.entries.first
        let openTodos = dashboard.todos
            .filter { !$0.done }
            .sorted { $0.orderIndex < $1.orderIndex }

        self.init(
            generatedAt: Date(),
            isAvailable: true,
            title: dashboard.stage.title,
            subtitle: dashboard.greeting,
            trailName: dashboard.trail.name,
            stageType: dashboard.stage.stageType,
            distanceKm: dashboard.stage.distanceKm,
            ascentM: dashboard.stage.ascentM,
            descentM: dashboard.stage.descentM,
            etaMinutes: Int((etaHours * 60).rounded()),
            difficultyLabel: Self.localizedDifficulty(dashboard.stage.difficultyClass),
            summary: dashboard.summary,
            weatherCondition: midday.map { weatherConditionLabel($0.condition) },
            temperatureC: midday?.tempC,
            precipTotalMm: dashboard.weather?.precipTotalMm,
            rainStartsHour: dashboard.weather?.rainStartsHour,
            openTodoCount: openTodos.count,
            todoTitles: openTodos.prefix(3).map(\.text),
            dayNumber: dashboard.isTransit ? nil : dashboard.dayNumber,
            routeProfile: Self.makeRouteProfile(dashboard.elevationProfile),
            timelineItems: Self.makeTimelineItems(dashboard.timeline),
            rainBand: Self.makeRainBand(dashboard.isTransit ? nil : dashboard.timeline?.rainBand),
            routePrecip: Self.makeRoutePrecip(dashboard)
        )
    }

    private static func makeRoutePrecip(_ dashboard: TodayDashboard) -> [WatchRoutePrecipPoint] {
        guard !dashboard.isTransit, dashboard.timeline?.rainBand != nil else { return [] }
        let totalKm = dashboard.elevationProfile.last?.dKm ?? 0
        return precipAlongRoute(dashboard.weather, totalKm: totalKm, samples: 24).map {
            WatchRoutePrecipPoint(km: $0.km, precipMm: $0.precipMm)
        }
    }

    private static func makeRainBand(_ band: RainBand?) -> WatchRainBand? {
        guard let band else { return nil }
        return WatchRainBand(
            startKm: band.startKm,
            endKm: band.endKm,
            peakKm: band.peakKm,
            startHour: band.startHour,
            endHour: band.endHour
        )
    }

    private static func makeRouteProfile(_ profile: [ElevationPoint]) -> [WatchRouteProfilePoint] {
        downsample(profile, maxPoints: 28).map {
            WatchRouteProfilePoint(distanceKm: $0.dKm, elevationM: Int($0.eleM.rounded()))
        }
    }

    private static func makeTimelineItems(_ timeline: RouteTimeline?) -> [WatchRouteTimelineItem] {
        guard let timeline else { return [] }
        return timeline.rows.prefix(8).map {
            WatchRouteTimelineItem(
                hour: $0.hour,
                title: $0.title,
                detail: $0.detail,
                distanceKm: $0.distanceKm,
                elevationM: $0.elevationM,
                isWeather: $0.isStorm
            )
        }
    }

    private static func downsample(_ profile: [ElevationPoint], maxPoints: Int) -> [ElevationPoint] {
        guard profile.count > maxPoints, maxPoints > 2 else { return profile }
        let step = Double(profile.count - 1) / Double(maxPoints - 1)
        return (0 ..< maxPoints).map { index in
            profile[Int((Double(index) * step).rounded())]
        }
    }

    static func localizedDifficulty(_ raw: String?) -> String? {
        switch raw?.lowercased() {
        case "easy": return "Snadné"
        case "moderate": return "Střední"
        case "hard": return "Těžké"
        case "extreme": return "Extrémní"
        default: return nil
        }
    }
}
