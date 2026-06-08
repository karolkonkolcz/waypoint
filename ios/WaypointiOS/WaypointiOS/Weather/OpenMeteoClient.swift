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
}

enum OpenMeteoError: Error {
    case invalidURL
    case requestFailed
}
