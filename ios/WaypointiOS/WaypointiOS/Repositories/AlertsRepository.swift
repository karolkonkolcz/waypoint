//
//  AlertsRepository.swift
//  WaypointiOS
//
//  Fetches MeteoAlarm warnings for a coordinate and caches them per trail.
//  Mirrors the PWA's alertsRepo: local-only (not synced), kept visible even
//  when empty so the panel doubles as an API health check. Cache lives in
//  UserDefaults — alerts are derived, small, and cheap to refetch.
//

import Foundation

nonisolated struct CachedAlerts: Codable, Sendable {
    var country: String?
    var alerts: [WeatherAlert]
    var fetchedAt: Date
}

actor AlertsRepository {
    static let shared = AlertsRepository()

    private let defaults = UserDefaults.standard
    /// Refetch after this; upstream itself caches ~30 min.
    private let freshness: TimeInterval = 30 * 60

    private func key(trailId: String) -> String { "alertsCache.v1.\(trailId)" }

    func cached(trailId: String) -> CachedAlerts? {
        guard let data = defaults.data(forKey: key(trailId: trailId)),
              let decoded = try? JSONDecoder().decode(CachedAlerts.self, from: data) else { return nil }
        return decoded
    }

    func isFresh(_ cached: CachedAlerts) -> Bool {
        Date().timeIntervalSince(cached.fetchedAt) < freshness
    }

    /// Returns cached alerts immediately if fresh; otherwise fetches, caches,
    /// and returns. Returns nil only when there's nothing to show and the
    /// network failed (caller keeps any prior cache).
    @discardableResult
    func refresh(trailId: String, lat: Double, lon: Double) async -> CachedAlerts? {
        if let hit = cached(trailId: trailId), isFresh(hit) { return hit }

        guard let slug = slugFromLatLon(lat: lat, lon: lon) else {
            let empty = CachedAlerts(country: nil, alerts: [], fetchedAt: Date())
            store(empty, trailId: trailId)
            return empty
        }

        guard let url = URL(string: "https://feeds.meteoalarm.org/api/v1/warnings/feeds-\(slug)") else {
            return cached(trailId: trailId)
        }
        var request = URLRequest(url: url)
        request.setValue("Waypoint/1.0 (offline hiking app)", forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 12

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return cached(trailId: trailId)
            }
            let raw = try JSONSerialization.jsonObject(with: data)
            let alerts = parseMeteoalarmFeed(raw, now: Date())
            let result = CachedAlerts(country: slug, alerts: alerts, fetchedAt: Date())
            store(result, trailId: trailId)
            return result
        } catch {
            return cached(trailId: trailId)
        }
    }

    private func store(_ value: CachedAlerts, trailId: String) {
        if let data = try? JSONEncoder().encode(value) {
            defaults.set(data, forKey: key(trailId: trailId))
        }
    }
}
