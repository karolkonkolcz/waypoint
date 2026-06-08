import Foundation

/// Map basemap configuration. Mirrors the web client's MapTiler setup
/// (`web/components/map/MapView.tsx`): same `outdoor-v2` hiking style so the
/// iOS and web maps look identical. The key is a publishable MapTiler key —
/// safe to ship in the client, same as on the web (`NEXT_PUBLIC_MAPTILER_*`).
enum MapConfig {
    /// MapTiler API key (shared with the web client).
    static let maptilerKey = "vyTBQIWAkqJzRNrs23yd"

    /// Hiking-oriented vector basemap style. `nil` only if the key is blank,
    /// in which case the UI falls back to the offline Canvas renderer.
    static var styleURL: URL? {
        guard !maptilerKey.isEmpty else { return nil }
        return URL(string: "https://api.maptiler.com/maps/outdoor-v2/style.json?key=\(maptilerKey)")
    }
}
