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

@Suite("MeteogramSeries")
struct MeteogramSeriesTests {
    @Test func decodesRichForecastAndFillsEveryPanel() throws {
        let json = """
        {
          "latitude": 50.0, "longitude": 14.0,
          "hourly": {
            "time": ["2026-06-09T00:00", "2026-06-09T01:00"],
            "temperature_2m": [12.0, 13.0],
            "cloud_cover_low": [10, 20],
            "cloud_cover_mid": [30, 40],
            "cloud_cover_high": [50, 60],
            "rain": [0.0, 1.5],
            "snowfall": [0.0, 0.0],
            "pressure_msl": [1012, 1011],
            "wind_speed_10m": [5, 7],
            "wind_gusts_10m": [9, 12],
            "wind_direction_10m": [180, 200]
          },
          "daily": {
            "time": ["2026-06-09"],
            "temperature_2m_max": [18.0],
            "temperature_2m_min": [9.0]
          }
        }
        """
        let forecast = try JSONDecoder().decode(RichForecast.self, from: Data(json.utf8))
        let series = forecastToMeteogram(forecast)

        #expect(series.time.count == 2)
        #expect(series.limited == false)
        #expect(series.temperature == [12.0, 13.0])
        #expect(series.cloudHigh == [50, 60])
        #expect(series.rain == [0.0, 1.5])
        #expect(series.pressure == [1012, 1011])
        #expect(series.windGusts == [9, 12])
        // Daily band expanded onto every hourly slot of that day.
        #expect(series.tempMin == [9.0, 9.0])
        #expect(series.tempMax == [18.0, 18.0])
    }

    @Test func limitedSeriesFillsOnlyTempPrecipWind() {
        let result = makeResult(precipitation: [0, 0.4, 0])
        let series = limitedMeteogramSeries(from: result)

        #expect(series.limited)
        #expect(series.time.count == 3)
        #expect(series.temperature == [18, 18, 18])
        #expect(series.rain == [0, 0.4, 0])
        #expect(series.windSpeed == [12, 12, 12])
        #expect(series.cloudLow == nil)
        #expect(series.pressure == nil)
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
