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

/// The stretch of route where significant rain is projected — start → peak →
/// end, in km along the route, with the clock time you reach each edge. Drawn
/// as a shaded band on the elevation profile (more informative than a single
/// onset line: it shows how long you'll be in it and where it's heaviest).
struct RainBand: Sendable, Equatable {
    var startKm: Double
    var endKm: Double
    var peakKm: Double
    var startHour: Double
    var endHour: Double
    var peakPrecipMm: Double
}

struct RouteTimeline: Sendable {
    var rows: [RouteTimelineRow]
    var rainOnset: RainOnset?
    var rainBand: RainBand?
    var arrivalHour: Double

    /// Replace the start/finish row titles. Used after the direction's
    /// coordinate labels are upgraded to place names post-load, so the timeline
    /// doesn't keep showing raw "lat, lon".
    func relabelEndpoints(start: String, destination: String) -> RouteTimeline {
        var copy = self
        copy.rows = rows.map { row in
            var r = row
            if r.kind == .start { r.title = start }
            if r.kind == .finish { r.title = destination }
            return r
        }
        return copy
    }
}

private let rainThresholdMm = 0.5
/// The band brackets *any* projected rain (matching the "déšť kolem HH:00"
/// headline, which fires on `precipMm > 0`), not just heavy rain — otherwise
/// light drizzle that the summary promises would leave the profile blank.
/// Precip is rounded to tenths, so `>= 0.05` catches every >=0.1 mm/h hour the
/// headline does, while still giving the edges a real midpoint to interpolate.
private let rainBandThresholdMm = 0.05

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

/// Clock time (decimal hours) you reach `km`, interpolated from the moving-
/// weather entries' own (km, hour) pairs.
private func hourAtKmMoving(_ entries: [MovingWeatherEntry], _ km: Double) -> Double {
    guard let first = entries.first, let last = entries.last else { return 0 }
    if km <= first.km { return Double(first.hour) }
    if km >= last.km { return Double(last.hour) }
    for i in 1 ..< entries.count {
        let a = entries[i - 1], b = entries[i]
        if b.km >= km {
            let span = b.km - a.km
            let t = span <= 0 ? 0 : (km - a.km) / span
            return Double(a.hour) + t * Double(b.hour - a.hour)
        }
    }
    return Double(last.hour)
}

/// The first contiguous run of significant rain along the route, as a band with
/// interpolated threshold-crossing edges and a precipitation peak.
func rainBandFromSnapshot(_ snapshot: WeatherSnapshot?, profile: [ElevationPoint]) -> RainBand? {
    guard let moving = snapshot?.moving else { return nil }
    let entries = moving.filter { $0.phase == .moving }.sorted { $0.km < $1.km }
    guard let firstWet = entries.firstIndex(where: { $0.precipMm >= rainBandThresholdMm }) else {
        return nil
    }

    var lastWet = firstWet
    while lastWet + 1 < entries.count, entries[lastWet + 1].precipMm > rainBandThresholdMm {
        lastWet += 1
    }

    let totalKm = profile.last?.dKm ?? entries[lastWet].km

    // Start edge: where precip crosses the threshold between the dry and wet entry.
    let startKm: Double
    if firstWet > 0 {
        let a = entries[firstWet - 1], b = entries[firstWet]
        let denom = b.precipMm - a.precipMm
        let t = denom <= 0 ? 0 : min(max((rainBandThresholdMm - a.precipMm) / denom, 0), 1)
        startKm = a.km + t * (b.km - a.km)
    } else {
        startKm = max(entries[firstWet].km, 0)
    }

    // End edge: where precip drops back below the threshold.
    let endKm: Double
    if lastWet + 1 < entries.count {
        let a = entries[lastWet], b = entries[lastWet + 1]
        let denom = a.precipMm - b.precipMm
        let t = denom <= 0 ? 0 : min(max((a.precipMm - rainBandThresholdMm) / denom, 0), 1)
        endKm = a.km + t * (b.km - a.km)
    } else {
        endKm = min(entries[lastWet].km, totalKm)
    }

    let peak = entries[firstWet ... lastWet].max { $0.precipMm < $1.precipMm } ?? entries[firstWet]

    return RainBand(
        startKm: startKm,
        endKm: max(endKm, startKm),
        peakKm: peak.km,
        startHour: hourAtKmMoving(entries, startKm),
        endHour: hourAtKmMoving(entries, endKm),
        peakPrecipMm: peak.precipMm
    )
}

/// One precipitation bar along the route, keyed by distance.
struct RoutePrecipPoint: Sendable, Equatable, Identifiable {
    var id: Double { km }
    var km: Double
    var precipMm: Double
}

/// Projected precipitation (mm/h) sampled at evenly spaced points along the
/// route, interpolated from the hourly moving-weather entries. Drives the
/// "Srážky na trase" bar strip beneath the elevation profile, sharing its
/// distance axis. Returns `[]` when there's no moving forecast.
func precipAlongRoute(_ snapshot: WeatherSnapshot?, totalKm: Double, samples: Int = 36) -> [RoutePrecipPoint] {
    guard let moving = snapshot?.moving, totalKm > 0, samples > 1 else { return [] }
    let entries = moving.filter { $0.phase == .moving }.sorted { $0.km < $1.km }
    guard let first = entries.first, let last = entries.last else { return [] }

    func precipAtKm(_ km: Double) -> Double {
        if km <= first.km { return first.precipMm }
        if km >= last.km { return last.precipMm }
        for i in 1 ..< entries.count {
            let a = entries[i - 1], b = entries[i]
            if b.km >= km {
                let span = b.km - a.km
                let t = span <= 0 ? 0 : (km - a.km) / span
                return a.precipMm + t * (b.precipMm - a.precipMm)
            }
        }
        return last.precipMm
    }

    let step = totalKm / Double(samples - 1)
    return (0 ..< samples).map { i in
        let km = Double(i) * step
        return RoutePrecipPoint(km: km, precipMm: max(0, precipAtKm(km)))
    }
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
        return RouteTimeline(rows: [], rainOnset: nil, rainBand: nil, arrivalHour: Double(startHour))
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
    let rainBand = rainBandFromSnapshot(snapshot, profile: profile)
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
    return RouteTimeline(rows: rows, rainOnset: rainOnset, rainBand: rainBand, arrivalHour: arrivalHour)
}
