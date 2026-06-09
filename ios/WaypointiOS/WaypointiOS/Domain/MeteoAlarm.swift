//
//  MeteoAlarm.swift
//  WaypointiOS
//
//  Port of web/lib/alerts/meteoalarm.ts. MeteoAlarm (EUMETNET) severe-weather
//  warnings: CAP JSON from feeds.meteoalarm.org, one entry per active warning.
//  The PWA proxies the feed through /api/alerts (browser CORS); native can hit
//  it directly with a User-Agent. Parsing is pure (untyped traversal mirroring
//  the TS) so it stays robust to the feed's loose shape.
//

import Foundation

enum AlertSeverity: String, Codable, Sendable {
    case yellow, orange, red

    var rank: Int {
        switch self {
        case .yellow: return 1
        case .orange: return 2
        case .red: return 3
        }
    }
}

struct WeatherAlert: Codable, Sendable, Identifiable {
    var event: String
    var severity: AlertSeverity
    var onset: String?
    var expires: String?
    var areas: [String]
    var description: String
    var sender: String

    var id: String { "\(severity.rawValue)|\(event)" }
}

// MARK: - Severity / event labels

private func parseSeverity(_ value: String) -> AlertSeverity? {
    let parts = value.split(separator: ";").map {
        $0.trimmingCharacters(in: .whitespaces).lowercased()
    }
    if parts.count > 1 {
        switch parts[1] {
        case "yellow": return .yellow
        case "orange": return .orange
        case "red": return .red
        default: break
        }
    }
    switch parts.first {
    case "2": return .yellow
    case "3": return .orange
    case "4": return .red
    default: return nil
    }
}

private let eventLabels: [String: String] = [
    "1": "Vítr", "2": "Sníh a led", "3": "Bouřky", "4": "Mlha",
    "5": "Vysoké teploty", "6": "Nízké teploty", "7": "Pobřežní jevy",
    "8": "Riziko požárů", "9": "Laviny", "10": "Déšť", "11": "Povodně",
    "12": "Déšť a povodně", "13": "Mořské bouře",
]

private func parseEventType(_ value: String) -> String {
    let parts = value.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
    if let code = parts.first, let label = eventLabels[code] { return label }
    return parts.count > 1 ? parts[1] : (parts.first ?? "Výstraha počasí")
}

// MARK: - Untyped traversal helpers

private func paramValue(_ params: Any?, _ name: String) -> String? {
    guard let array = params as? [[String: Any]] else { return nil }
    for p in array where (p["valueName"] as? String) == name {
        if let value = p["value"] as? String { return value }
    }
    return nil
}

private func pickInfo(_ info: [[String: Any]]) -> [String: Any]? {
    guard !info.isEmpty else { return nil }
    func lang(_ i: [String: Any]) -> String { (i["language"] as? String ?? "").lowercased() }
    if let preferred = info.first(where: { lang($0).hasPrefix("cs") || lang($0).hasPrefix("sk") }) {
        return preferred
    }
    if let en = info.first(where: { lang($0).hasPrefix("en") }) { return en }
    return info.first
}

private func areaDescs(_ area: Any?) -> [String] {
    guard let array = area as? [[String: Any]] else { return [] }
    return array.compactMap { $0["areaDesc"] as? String }.filter { !$0.isEmpty }
}

/// Normalize a MeteoAlarm feed into active, displayable alerts.
/// Drops green/level-1, expired, and unparseable warnings; dedups by
/// (severity, event) merging areas; sorts most severe first.
func parseMeteoalarmFeed(_ raw: Any, now: Date) -> [WeatherAlert] {
    guard let root = raw as? [String: Any],
          let warnings = root["warnings"] as? [[String: Any]] else { return [] }

    var byKey: [String: WeatherAlert] = [:]
    var order: [String] = []
    let iso = ISO8601DateFormatter()

    for w in warnings {
        guard let alert = w["alert"] as? [String: Any],
              let info = alert["info"] as? [[String: Any]],
              let chosen = pickInfo(info) else { continue }

        guard let levelRaw = paramValue(chosen["parameter"], "awareness_level"),
              let severity = parseSeverity(levelRaw) else { continue }

        let expires = (chosen["expires"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        if let expires, let date = iso.date(from: expires), date < now { continue }

        let typeRaw = paramValue(chosen["parameter"], "awareness_type")
        let event = typeRaw.map(parseEventType)
            ?? (chosen["event"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            ?? "Výstraha počasí"
        let onset = (chosen["onset"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            ?? (chosen["effective"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let areas = areaDescs(chosen["area"])

        let key = "\(severity.rawValue)|\(event)"
        if var existing = byKey[key] {
            for a in areas where !existing.areas.contains(a) { existing.areas.append(a) }
            if let onset, existing.onset == nil || onset < existing.onset! { existing.onset = onset }
            if let expires, existing.expires == nil || expires > existing.expires! { existing.expires = expires }
            byKey[key] = existing
        } else {
            byKey[key] = WeatherAlert(
                event: event, severity: severity, onset: onset, expires: expires,
                areas: areas, description: chosen["description"] as? String ?? "",
                sender: chosen["senderName"] as? String ?? ""
            )
            order.append(key)
        }
    }

    return order.compactMap { byKey[$0] }
        .sorted { $0.severity.rank > $1.severity.rank }
}

/// Highest severity across a set of alerts, or nil if empty.
func maxSeverity(_ alerts: [WeatherAlert]) -> AlertSeverity? {
    alerts.map(\.severity).max { $0.rank < $1.rank }
}

// MARK: - Country lookup

private struct CountryBox {
    let slug: String
    let bbox: (west: Double, south: Double, east: Double, north: Double)
}

private let countryBoxes: [CountryBox] = [
    .init(slug: "france", bbox: (8.4, 41.3, 9.7, 43.1)), // Corsica first
    .init(slug: "slovakia", bbox: (16.8, 47.7, 22.6, 49.7)),
    .init(slug: "czechia", bbox: (12.0, 48.5, 18.9, 51.1)),
    .init(slug: "austria", bbox: (9.5, 46.3, 17.2, 49.1)),
    .init(slug: "slovenia", bbox: (13.3, 45.4, 16.6, 46.9)),
    .init(slug: "switzerland", bbox: (5.9, 45.8, 10.5, 47.9)),
    .init(slug: "hungary", bbox: (16.1, 45.7, 22.9, 48.6)),
    .init(slug: "croatia", bbox: (13.4, 42.3, 19.5, 46.6)),
    .init(slug: "poland", bbox: (14.1, 49.0, 24.2, 54.9)),
    .init(slug: "germany", bbox: (5.8, 47.2, 15.1, 55.1)),
    .init(slug: "italy", bbox: (6.6, 36.6, 18.6, 47.1)),
    .init(slug: "france", bbox: (-5.2, 41.3, 8.4, 51.1)), // mainland
    .init(slug: "spain", bbox: (-9.4, 36.0, 3.4, 43.8)),
    .init(slug: "portugal", bbox: (-9.6, 36.9, -6.2, 42.2)),
    .init(slug: "norway", bbox: (4.5, 57.9, 31.1, 71.2)),
]

/// Map a lat/lon to a MeteoAlarm country slug, or nil if outside coverage.
func slugFromLatLon(lat: Double, lon: Double) -> String? {
    for box in countryBoxes {
        if lon >= box.bbox.west, lon <= box.bbox.east, lat >= box.bbox.south, lat <= box.bbox.north {
            return box.slug
        }
    }
    return nil
}
