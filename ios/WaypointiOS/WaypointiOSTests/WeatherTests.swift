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
        // ~22 km flat route at 5 km/h → ETA ≈ 4.45 h, arrival at 13:00; moving
        // phase is 8..13. Weather en route is read from the NEAREST sample to the
        // projected position, so the hiker only starts reading the far (wet)
        // sample once past the halfway crossover (~km 11.1) — that's hour 11
        // (km ≈ 15). Putting rain there is the first hour the journey gets wet.
        let dry = makeResult(lon: 0, precipitation: Array(repeating: 0, count: 48))
        var wetPrecip = Array(repeating: 0.0, count: 48)
        wetPrecip[11] = 1.2
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
        #expect(snapshot?.rainStartsHour == 11)
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

    @Test func limitedSeriesCanFilterToStageDate() {
        let precipitation = Array(0 ..< 72).map(Double.init)
        let result = makeResult(precipitation: precipitation)
        let series = limitedMeteogramSeries(from: result, date: "2026-06-06", hourLimit: 24)

        #expect(series.time.count == 24)
        #expect(series.rain?.first == 24)
        #expect(series.rain?.last == 47)
    }

    @Test func richForecastCanLimitTo48Hours() throws {
        let hourlyTimes = (0 ..< 72).map { index in
            let day = index < 24 ? "2026-06-09" : index < 48 ? "2026-06-10" : "2026-06-11"
            return "\(day)T\(String(format: "%02d", index % 24)):00"
        }
        let forecast = RichForecast(
            latitude: 50,
            longitude: 14,
            hourly: RichForecast.Hourly(
                time: hourlyTimes,
                temperature2m: Array(repeating: 12, count: 72),
                cloudCoverLow: Array(repeating: 10, count: 72),
                cloudCoverMid: Array(repeating: 20, count: 72),
                cloudCoverHigh: Array(repeating: 30, count: 72),
                rain: Array(repeating: 0, count: 72),
                snowfall: Array(repeating: 0, count: 72),
                pressureMsl: Array(repeating: 1012, count: 72),
                windSpeed10m: Array(repeating: 5, count: 72),
                windGusts10m: Array(repeating: 8, count: 72),
                windDirection10m: Array(repeating: 180, count: 72)
            ),
            daily: RichForecast.Daily(
                time: ["2026-06-09", "2026-06-10", "2026-06-11"],
                temperature2mMax: [18, 19, 20],
                temperature2mMin: [8, 9, 10]
            )
        )

        let series = forecastToMeteogram(forecast, hourLimit: 48)

        #expect(series.time.count == 48)
        #expect(series.temperature?.count == 48)
        #expect(series.tempMin?.first == 8)
        #expect(series.tempMax?.last == 19)
    }
}

private func makeResult(
    lat: Double = 50,
    lon: Double = 14,
    precipitation: [Double]
) -> OpenMeteoResult {
    let times = (0 ..< precipitation.count).map { index in
        let day = String(format: "2026-06-%02d", 5 + (index / 24))
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
