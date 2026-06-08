//
//  Eta.swift
//  WaypointiOS
//
//  Verbatim port of web/lib/domain/eta.ts.
//  Constants are canonical in ARCHITECTURE.md §10.2 — change there first.
//

import Foundation

// MARK: - Constants

private let climbRateMPerH: Double = 600

// MARK: - Naismith / Tobler

/// Naismith: time = distance / pace + ascent / climbRate.
func naismithHours(distanceKm: Double, ascentM: Double, paceKmh: Double) -> Double {
    distanceKm / paceKmh + ascentM / climbRateMPerH
}

/// Tobler walking speed (km/h) for a given slope dh/dx. Drop-in alternative.
func toblerSpeedKmh(slope: Double) -> Double {
    6 * exp(-3.5 * abs(slope + 0.05))
}

// MARK: - computeETA

struct ETAResult: Sendable {
    let totalHours: Double
    let arrivalTime: Date
}

func computeETA(
    distanceKm: Double,
    ascentM: Double,
    paceKmh: Double,
    startTime: Date
) -> ETAResult {
    let totalHours = naismithHours(distanceKm: distanceKm, ascentM: ascentM, paceKmh: paceKmh)
    let arrivalTime = startTime.addingTimeInterval(totalHours * 3600)
    return ETAResult(totalHours: totalHours, arrivalTime: arrivalTime)
}

// MARK: - Time profile (per-segment Naismith)

struct ElevationPoint: Sendable {
    let dKm: Double
    let eleM: Double
}

struct TimeProfilePoint: Sendable {
    let km: Double
    let h: Double
}

/// Cumulative time profile over elevation samples. Steeper on climbs.
func cumulativeTimeProfile(profile: [ElevationPoint], paceKmh: Double) -> [TimeProfilePoint] {
    guard !profile.isEmpty else { return [] }
    var pts: [TimeProfilePoint] = [.init(km: profile[0].dKm, h: 0)]
    for i in 1 ..< profile.count {
        let dKm = max(0, profile[i].dKm - profile[i - 1].dKm)
        let ascent = max(0, profile[i].eleM - profile[i - 1].eleM)
        let dt = naismithHours(distanceKm: dKm, ascentM: ascent, paceKmh: paceKmh)
        pts.append(.init(km: profile[i].dKm, h: pts[i - 1].h + dt))
    }
    return pts
}

/// Total walking time for the full profile, in hours.
func totalEtaHours(profile: [TimeProfilePoint]) -> Double {
    profile.last?.h ?? 0
}

/// Distance (km) reached after `elapsedH` hours. Clamps to route ends.
func kmAtElapsed(profile: [TimeProfilePoint], elapsedH: Double) -> Double {
    guard !profile.isEmpty else { return 0 }
    if elapsedH <= profile[0].h { return profile[0].km }
    let last = profile[profile.count - 1]
    if elapsedH >= last.h { return last.km }
    for i in 1 ..< profile.count {
        if profile[i].h >= elapsedH {
            let span = profile[i].h - profile[i - 1].h
            if span <= 0 { return profile[i].km }
            let t = (elapsedH - profile[i - 1].h) / span
            return profile[i - 1].km + t * (profile[i].km - profile[i - 1].km)
        }
    }
    return last.km
}

/// [lon, lat] after `elapsedH` hours, via the time profile.
func positionAtElapsed(route: LineString, profile: [TimeProfilePoint], elapsedH: Double) -> Coord2 {
    pointAtDistance(route, kmAtElapsed(profile: profile, elapsedH: elapsedH))
}

/// [lon, lat] a hiker has reached at `now` given they started at `startTime`.
func positionAt(
    startTime: Date,
    now: Date,
    route: LineString,
    ascentM: Double,
    paceKmh: Double
) -> Coord2 {
    let elapsedH = now.timeIntervalSince(startTime) / 3600
    let routeKm = totalDistance(route)
    let effectivePace = routeKm / naismithHours(distanceKm: routeKm, ascentM: ascentM, paceKmh: paceKmh)
    let coveredKm = min(elapsedH * effectivePace, routeKm)
    return pointAtDistance(route, coveredKm)
}
