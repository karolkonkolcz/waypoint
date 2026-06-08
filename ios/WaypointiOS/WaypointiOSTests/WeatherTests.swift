import Foundation
import Testing
@testable import WaypointiOS

@Suite("WeatherSnapshot")
struct WeatherSnapshotTests {
    @Test func fixedHourSnapshotUsesDisplayHours() {
        let result = makeResult(precipitation: Array(repeating: 0, count: 24))
        let snapshot = buildWeatherSnapshot(result, date: "2026-06-05")

        #expect(snapshot.entries.map(\.hour) == [8, 12, 16])
        #expect(snapshot.precipTotalMm == 0)
        #expect(snapshot.windMaxKmh == 12)
    }

    @Test func routeSnapshotFindsFirstMovingRainHour() {
        let route = LineString(coordinates: [[0, 0], [0.2, 0]])
        let profile = [
            ElevationPoint(dKm: 0, eleM: 0),
            ElevationPoint(dKm: totalDistance(route), eleM: 0),
        ]
        let dry = makeResult(lon: 0, precipitation: Array(repeating: 0, count: 48))
        var wetPrecip = Array(repeating: 0.0, count: 48)
        wetPrecip[10] = 1.2
        let wet = makeResult(lon: 0.2, precipitation: wetPrecip)
        let samples = [
            WeatherSampleCache(sampleIndex: 0, distanceKm: 0, date: "2026-06-05", result: dry),
            WeatherSampleCache(sampleIndex: 1, distanceKm: totalDistance(route), date: "2026-06-05", result: wet),
        ]

        let snapshot = buildRouteWeatherSnapshot(
            samples: samples,
            route: route,
            elevationProfile: profile,
            paceKmh: 5,
            startHour: 8,
            date: "2026-06-05"
        )

        #expect(snapshot?.startHour == 8)
        #expect(snapshot?.rainStartsHour == 10)
        #expect((snapshot?.rainStartsKm ?? 0) > 0)
    }
}

private func makeResult(
    lat: Double = 50,
    lon: Double = 14,
    precipitation: [Double]
) -> OpenMeteoResult {
    let times = (0 ..< precipitation.count).map { index in
        let day = index < 24 ? "2026-06-05" : "2026-06-06"
        return "\(day)T\(String(format: "%02d", index % 24)):00"
    }
    return OpenMeteoResult(
        latitude: lat,
        longitude: lon,
        hourly: HourlyForecast(
            time: times,
            temperature2m: Array(repeating: 18, count: precipitation.count),
            precipitation: precipitation,
            windspeed10m: Array(repeating: 12, count: precipitation.count),
            weathercode: precipitation.map { $0 > 0 ? 61 : 0 }
        )
    )
}
