//
//  RouteTimeline.swift
//  WaypointiOS
//
//  Port of web/lib/domain/routeTimeline.ts. Turns an elevation profile, the
//  stage waypoints and the moving-weather snapshot into an ordered "where will
//  you be, when" timeline (start → waypoints → highest point → rain onset →
//  finish) used by the Today screen's ETA × srážky panel.
//

import Foundation

enum TimelinePointKind: String, Sendable {
    case start, water, peak, town, camp, shelter, resupply, storm, finish, other
}

struct RouteTimelineRow: Identifiable, Sendable {
    var id: String
    var kind: TimelinePointKind
    var title: String
    var detail: String?
    var hour: Double
    var distanceKm: Double
    var elevationM: Int?
    var precipMm: Double?
    var isStorm: Bool
}

struct RainOnset: Sendable, Equatable {
    var hour: Double
    var distanceKm: Double
    var elevationM: Int?
    var precipMm: Double
}

struct RouteTimeline: Sendable {
    var rows: [RouteTimelineRow]
    var rainOnset: RainOnset?
    var arrivalHour: Double
}

private let rainThresholdMm = 0.5

/// Interpolated elevation (m) at `targetKm` along the profile. Clamps to ends.
func elevationAtDistance(_ profile: [ElevationPoint], _ targetKm: Double) -> Int? {
    guard let first = profile.first, let last = profile.last else { return nil }
    if targetKm <= first.dKm { return Int(first.eleM.rounded()) }
    if targetKm >= last.dKm { return Int(last.eleM.rounded()) }
    for i in 1 ..< profile.count {
        let a = profile[i - 1], b = profile[i]
        if b.dKm >= targetKm {
            let span = b.dKm - a.dKm
            let t = span <= 0 ? 0 : (targetKm - a.dKm) / span
            return Int((a.eleM + t * (b.eleM - a.eleM)).rounded())
        }
    }
    return Int(last.eleM.rounded())
}

private func hoursAtKm(_ profile: [TimeProfilePoint], _ targetKm: Double) -> Double {
    guard let first = profile.first, let last = profile.last else { return 0 }
    if targetKm <= first.km { return first.h }
    if targetKm >= last.km { return last.h }
    for i in 1 ..< profile.count {
        let a = profile[i - 1], b = profile[i]
        if b.km >= targetKm {
            let span = b.km - a.km
            let t = span <= 0 ? 0 : (targetKm - a.km) / span
            return a.h + t * (b.h - a.h)
        }
    }
    return last.h
}

private func waypointKind(_ type: String) -> TimelinePointKind {
    switch type {
    case "water": return .water
    case "camp": return .camp
    case "shelter": return .shelter
    case "resupply": return .resupply
    case "town": return .town
    case "peak": return .peak
    default: return .other
    }
}

private func nearestRow(_ rows: [RouteTimelineRow], _ distanceKm: Double) -> RouteTimelineRow? {
    var best: RouteTimelineRow?
    var bestDistance = Double.infinity
    for row in rows where row.kind != .start && row.kind != .finish && row.kind != .storm {
        let d = abs(row.distanceKm - distanceKm)
        if d < bestDistance { best = row; bestDistance = d }
    }
    return bestDistance <= 2 ? best : nil
}

func rainOnsetFromSnapshot(_ snapshot: WeatherSnapshot?, profile: [ElevationPoint]) -> RainOnset? {
    guard let moving = snapshot?.moving, !moving.isEmpty else { return nil }
    guard let wet = moving.first(where: { $0.phase == .moving && $0.precipMm >= rainThresholdMm }) else {
        return nil
    }
    return RainOnset(
        hour: Double(wet.hour),
        distanceKm: wet.km,
        elevationM: elevationAtDistance(profile, wet.km),
        precipMm: wet.precipMm
    )
}

func buildRouteTimeline(
    profile: [ElevationPoint],
    waypoints: [Waypoint],
    paceKmh: Double,
    startHour: Int,
    startName: String,
    destinationName: String,
    snapshot: WeatherSnapshot?
) -> RouteTimeline {
    guard profile.count >= 2 else {
        return RouteTimeline(rows: [], rainOnset: nil, arrivalHour: Double(startHour))
    }

    let timeProfile = cumulativeTimeProfile(profile: profile, paceKmh: paceKmh)
    let totalKm = profile[profile.count - 1].dKm
    let totalHours = totalEtaHours(profile: timeProfile)
    let arrivalHour = Double(startHour) + totalHours

    var rows: [RouteTimelineRow] = [
        RouteTimelineRow(
            id: "start", kind: .start, title: startName, detail: "Start",
            hour: Double(startHour), distanceKm: 0,
            elevationM: elevationAtDistance(profile, 0), precipMm: nil, isStorm: false
        )
    ]

    let stageWaypoints = waypoints
        .filter { $0.distanceAlongRouteKm != nil }
        .filter { ($0.distanceAlongRouteKm ?? 0) > 0.1 && ($0.distanceAlongRouteKm ?? 0) < totalKm - 0.1 }
        .sorted { ($0.distanceAlongRouteKm ?? 0) < ($1.distanceAlongRouteKm ?? 0) }

    for waypoint in stageWaypoints {
        let km = waypoint.distanceAlongRouteKm ?? 0
        rows.append(RouteTimelineRow(
            id: waypoint.id, kind: waypointKind(waypoint.type), title: waypoint.name,
            detail: waypoint.description, hour: Double(startHour) + hoursAtKm(timeProfile, km),
            distanceKm: km, elevationM: waypoint.elevationM ?? elevationAtDistance(profile, km),
            precipMm: nil, isStorm: false
        ))
    }

    let highest = profile.max { $0.eleM < $1.eleM } ?? profile[0]
    let hasPeakNearby = rows.contains { abs($0.distanceKm - highest.dKm) < 0.5 }
    if !hasPeakNearby, highest.dKm > 0.5, highest.dKm < totalKm - 0.5 {
        rows.append(RouteTimelineRow(
            id: "highest-point", kind: .peak, title: "Nejvyšší bod", detail: nil,
            hour: Double(startHour) + hoursAtKm(timeProfile, highest.dKm),
            distanceKm: highest.dKm, elevationM: Int(highest.eleM.rounded()),
            precipMm: nil, isStorm: false
        ))
    }

    rows.append(RouteTimelineRow(
        id: "finish", kind: .finish, title: destinationName, detail: "Cíl",
        hour: arrivalHour, distanceKm: totalKm,
        elevationM: elevationAtDistance(profile, totalKm), precipMm: nil, isStorm: false
    ))

    let rainOnset = rainOnsetFromSnapshot(snapshot, profile: profile)
    if let rainOnset {
        let near = nearestRow(rows, rainOnset.distanceKm)
        rows.append(RouteTimelineRow(
            id: "storm", kind: .storm, title: near?.title ?? "Srážky na trase",
            detail: String(format: "%.1f mm/h", rainOnset.precipMm),
            hour: rainOnset.hour, distanceKm: rainOnset.distanceKm,
            elevationM: rainOnset.elevationM, precipMm: rainOnset.precipMm, isStorm: true
        ))
    }

    rows.sort {
        if $0.distanceKm != $1.distanceKm { return $0.distanceKm < $1.distanceKm }
        return ($0.isStorm ? 1 : 0) > ($1.isStorm ? 1 : 0)
    }
    return RouteTimeline(rows: rows, rainOnset: rainOnset, arrivalHour: arrivalHour)
}
