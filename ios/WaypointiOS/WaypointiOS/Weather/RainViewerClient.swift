import Foundation

/// RainViewer API client for the radar overlay. Port of the web client
/// (`web/lib/weather/rainviewer.ts`). Free tier (effective 2026-01-01): past
/// radar only — last ~2 h at 10-min intervals (~12 frames), max zoom 7,
/// Universal Blue colour scheme only, attribution required. Nowcast is
/// discontinued and deliberately ignored.
struct RadarFrame: Codable, Sendable, Equatable, Identifiable {
    /// Unix timestamp (seconds).
    let time: Int
    /// Tile path, e.g. "/v2/radar/1720000000".
    let path: String

    var id: Int { time }
    var date: Date { Date(timeIntervalSince1970: TimeInterval(time)) }
}

enum RainViewerClient {
    /// Maximum zoom radar tiles carry data for — clamps the map so tiles never upscale.
    static let maxZoom = 7

    private static let framesURL = URL(string: "https://api.rainviewer.com/public/weather-maps.json")!
    private static let cacheKey = "rainviewer.frames.v1"

    /// Fetch the list of past radar frames. On any failure (network, non-2xx,
    /// malformed body, offline) falls back to the last successfully cached list
    /// so the UI can still render the most recent radar from MapLibre's tile
    /// cache. Returns an empty array only when there is no cache to fall back to.
    static func fetchFrames() async -> [RadarFrame] {
        do {
            let (data, response) = try await URLSession.shared.data(from: framesURL)
            guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
                return cachedFrames()
            }
            // Only `radar.past` — nowcast is discontinued and intentionally ignored.
            let frames = (try JSONDecoder().decode(WeatherMaps.self, from: data)).radar?.past ?? []
            guard !frames.isEmpty else { return cachedFrames() }
            cache(frames)
            return frames
        } catch {
            return cachedFrames()
        }
    }

    /// MapLibre raster tile URL template for a frame path.
    /// size=512, color=2 (Universal Blue), options=1_1 (smooth + show snow).
    /// `{z}/{x}/{y}` stay as MapLibre template variables.
    static func tileURL(path: String) -> String {
        "https://tilecache.rainviewer.com\(path)/512/{z}/{x}/{y}/2/1_1.png"
    }

    // MARK: - Persisted last-known frames

    private static func cache(_ frames: [RadarFrame]) {
        guard let data = try? JSONEncoder().encode(frames) else { return }
        UserDefaults.standard.set(data, forKey: cacheKey)
    }

    private static func cachedFrames() -> [RadarFrame] {
        guard let data = UserDefaults.standard.data(forKey: cacheKey),
              let frames = try? JSONDecoder().decode([RadarFrame].self, from: data) else { return [] }
        return frames
    }

    private struct WeatherMaps: Decodable {
        let radar: Radar?
        struct Radar: Decodable { let past: [RadarFrame]? }
    }
}
