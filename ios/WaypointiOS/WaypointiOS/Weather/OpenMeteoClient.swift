import Foundation

struct OpenMeteoClient: Sendable {
    func fetch(points: [Coord2], date: String, endDate: String? = nil) async throws -> [OpenMeteoResult] {
        guard !points.isEmpty else { return [] }

        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")
        components?.queryItems = [
            URLQueryItem(name: "latitude", value: points.map { String(format: "%.4f", $0.lat) }.joined(separator: ",")),
            URLQueryItem(name: "longitude", value: points.map { String(format: "%.4f", $0.lon) }.joined(separator: ",")),
            URLQueryItem(name: "hourly", value: "temperature_2m,precipitation,windspeed_10m,weathercode"),
            URLQueryItem(name: "timezone", value: "auto"),
            URLQueryItem(name: "start_date", value: date),
            URLQueryItem(name: "end_date", value: endDate ?? date),
        ]

        guard let url = components?.url else { throw OpenMeteoError.invalidURL }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw OpenMeteoError.requestFailed
        }

        let decoder = JSONDecoder()
        if let many = try? decoder.decode([OpenMeteoResult].self, from: data) {
            return many
        }
        return [try decoder.decode(OpenMeteoResult.self, from: data)]
    }

    /// Richer single-point forecast for the current-position meteogram: the full
    /// 12-variable hourly set + daily min/max over `forecastDays` days. Mirrors
    /// the web `/weather` request (web/lib/weather/current-position.ts).
    func fetchRich(lat: Double, lon: Double, forecastDays: Int = 4) async throws -> RichForecast {
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")
        components?.queryItems = [
            URLQueryItem(name: "latitude", value: String(format: "%.4f", lat)),
            URLQueryItem(name: "longitude", value: String(format: "%.4f", lon)),
            URLQueryItem(name: "hourly", value: [
                "temperature_2m",
                "cloud_cover_low",
                "cloud_cover_mid",
                "cloud_cover_high",
                "rain",
                "snowfall",
                "pressure_msl",
                "wind_speed_10m",
                "wind_gusts_10m",
                "wind_direction_10m",
            ].joined(separator: ",")),
            URLQueryItem(name: "daily", value: "temperature_2m_max,temperature_2m_min"),
            URLQueryItem(name: "forecast_days", value: String(forecastDays)),
            URLQueryItem(name: "timezone", value: "auto"),
        ]

        guard let url = components?.url else { throw OpenMeteoError.invalidURL }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw OpenMeteoError.requestFailed
        }
        return try JSONDecoder().decode(RichForecast.self, from: data)
    }
}

enum OpenMeteoError: Error {
    case invalidURL
    case requestFailed
}
