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
    private let cacheKey = "placeNameCache.v1"
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
        // Prefer the most specific human anchor a hiker would recognise.
        let candidates = [
            placemark.locality,        // town / village
            placemark.subLocality,     // district / quarter
            placemark.name.flatMap { $0.rangeOfCharacter(from: .decimalDigits) == nil ? $0 : nil },
            placemark.subAdministrativeArea,
            placemark.administrativeArea,
        ]
        return candidates.compactMap { $0 }.first { !$0.isEmpty }
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
