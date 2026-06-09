//
//  PlaceNameService.swift
//  WaypointiOS
//
//  Upgrades raw "lat, lon" direction endpoints to human place names via Apple's
//  reverse geocoder. Results are cached in UserDefaults keyed by a coarse
//  coordinate so the network is hit at most once per ~100 m cell, and never on
//  a cache hit — important for an offline-first trail app. Any failure (offline,
//  rate limit, no result) silently keeps the coordinate label.
//

import CoreLocation
import Foundation

actor PlaceNameService {
    static let shared = PlaceNameService()

    private let geocoder = CLGeocoder()
    private let defaults = UserDefaults.standard
    // v2: bumped after fixing candidate priority (v1 cached municipality/county
    // names like "Gusinje"/"Shkodër" instead of the local "Vusanje"/"Theth").
    private let cacheKey = "placeNameCache.v2"
    private var cache: [String: String]
    /// Coordinates that produced no usable name this session — don't retry them.
    private var negative: Set<String> = []

    init() {
        cache = defaults.dictionary(forKey: cacheKey) as? [String: String] ?? [:]
    }

    /// Rounded to ~100 m so nearby samples share a cache cell.
    private func key(lat: Double, lon: Double) -> String {
        String(format: "%.3f,%.3f", lat, lon)
    }

    /// Place name for a coordinate, or nil if it can't be resolved. Cached.
    func name(lat: Double, lon: Double) async -> String? {
        let k = key(lat: lat, lon: lon)
        if let hit = cache[k] { return hit }
        if negative.contains(k) { return nil }

        do {
            let placemarks = try await geocoder.reverseGeocodeLocation(
                CLLocation(latitude: lat, longitude: lon)
            )
            guard let name = bestName(from: placemarks.first) else {
                negative.insert(k)
                return nil
            }
            cache[k] = name
            defaults.set(cache, forKey: cacheKey)
            return name
        } catch {
            // Offline / rate-limited: fall back to the coordinate, retry later.
            return nil
        }
    }

    private func bestName(from placemark: CLPlacemark?) -> String? {
        guard let placemark else { return nil }
        // Order matters: in sparse / foreign trail areas `locality` resolves to
        // the *municipality* or *county* (e.g. "Gusinje", "Shkodër") — a town
        // tens of km away. The nearest named feature (`name`) and the village
        // (`subLocality`) are the anchors a hiker actually recognises, so they
        // come first. `administrativeArea` (region) is never useful and is dropped.
        let candidates = [
            cleanedFeatureName(placemark.name),  // nearest named place / feature
            placemark.subLocality,               // village / quarter
            placemark.locality,                  // town / municipality
            placemark.subAdministrativeArea,     // district
        ]
        return candidates.compactMap { $0 }.first { !$0.isEmpty }
    }

    /// Trims a feature name to its leading component and rejects street-address
    /// forms. "Vusanje - Ropojanska dolina" → "Vusanje"; "Theth" → "Theth";
    /// "Hlavní 25" → nil (digits). A bare hyphen ("Frýdek-Místek") is preserved.
    private func cleanedFeatureName(_ raw: String?) -> String? {
        guard let raw, raw.rangeOfCharacter(from: .decimalDigits) == nil else { return nil }
        let head = raw.components(separatedBy: CharacterSet(charactersIn: ",(")).first ?? raw
        let trimmed = head
            .replacingOccurrences(of: #"\s+[–—-]\s+.*$"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

extension RouteDirection {
    /// A copy with coordinate endpoints replaced by resolved place names.
    /// Non-coordinate parts (already place names from the title) are kept as-is.
    func upgrading(start newStart: String?, destination newDestination: String?) -> RouteDirection {
        let s = (isCoordinateLabel(start) ? newStart : nil) ?? start
        let d = (isCoordinateLabel(destination) ? newDestination : nil) ?? destination
        return RouteDirection(start: s, destination: d, label: "\(s) → \(d)")
    }
}
