import Foundation

enum RouteTimelineKind: Sendable {
    case start
    case water
    case peak
    case town
    case camp
    case shelter
    case resupply
    case storm
    case finish
    case other
}

struct RouteTimelineRow: Identifiable, Sendable {
    var id: String
    var kind: RouteTimelineKind
    var title: String
    var detail: String?
    var hour: Double
    var distanceKm: Double
    var elevationM: Int?
    var precipMm: Double?
    var isStorm: Bool
}

struct RainOnset: Sendable {
    var hour: Int
    var distanceKm: Double
    var elevationM: Int?
    var precipMm: Double
}

private let rainThresholdMm = 0.5

func elevationAtDistance(profile: [ElevationPoint], targetKm: Double) -> Int? {
    guard !profile.isEmpty else { return nil }
    if targetKm <= profile[0].dKm { return Int(profile[0].eleM.rounded()) }
    let last = profile[profile.count - 1]
    if targetKm >= last.dKm { return Int(last.eleM.rounded()) }

    for i in 1 ..< profile.count {
        let a = profile[i - 1]
        let b = profile[i]
        if b.dKm >= targetKm {
            let span = b.dKm - a.dKm
            let t = span <= 0 ? 0 : (targetKm - a.dKm) / span
            return Int((a.eleM + t * (b.eleM - a.eleM)).rounded())
        }
    }
    return Int(last.eleM.rounded())
}

private func hoursAtKm(profile: [TimeProfilePoint], targetKm: Double) -> Double {
    guard !profile.isEmpty else { return 0 }
    if targetKm <= profile[0].km { return profile[0].h }
    let last = profile[profile.count - 1]
    if targetKm >= last.km { return last.h }

    for i in 1 ..< profile.count {
        let a = profile[i - 1]
        let b = profile[i]
        if b.km >= targetKm {
            let span = b.km - a.km
            let t = span <= 0 ? 0 : (targetKm - a.km) / span
            return a.h + t * (b.h - a.h)
        }
    }
    return last.h
}

private func timelineKind(type: String) -> RouteTimelineKind {
    switch type {
    case "water": return .water
    case "camp": return .camp
    case "shelter", "hut": return .shelter
    case "resupply": return .resupply
    case "town": return .town
    case "peak": return .peak
    default: return .other
    }
}

private func nearestRow(rows: [RouteTimelineRow], distanceKm: Double) -> RouteTimelineRow? {
    var selected: RouteTimelineRow?
    var best = Double.infinity
    for row in rows where row.kind != .start && row.kind != .finish && row.kind != .storm {
        let distance = abs(row.distanceKm - distanceKm)
        if distance < best {
            best = distance
            selected = row
        }
    }
    return best <= 2 ? selected : nil
}

func rainOnset(snapshot: WeatherSnapshot?, profile: [ElevationPoint]) -> RainOnset? {
    guard let wet = snapshot?.moving?.first(where: { $0.phase == .moving && $0.precipMm >= rainThresholdMm }) else {
        return nil
    }
    return RainOnset(
        hour: wet.hour,
        distanceKm: wet.km,
        elevationM: elevationAtDistance(profile: profile, targetKm: wet.km),
        precipMm: wet.precipMm
    )
}

func buildRouteTimeline(
    profile: [ElevationPoint],
    waypoints: [Waypoint],
    paceKmh: Double,
    startHour: Double,
    startName: String,
    destinationName: String,
    snapshot: WeatherSnapshot?
) -> (rows: [RouteTimelineRow], rain: RainOnset?, arrivalHour: Double) {
    guard profile.count >= 2 else { return ([], nil, startHour) }

    let timeProfile = cumulativeTimeProfile(profile: profile, paceKmh: paceKmh)
    let totalKm = profile[profile.count - 1].dKm
    let arrivalHour = startHour + totalEtaHours(profile: timeProfile)

    var baseRows: [RouteTimelineRow] = [
        RouteTimelineRow(
            id: "start",
            kind: .start,
            title: startName,
            detail: "Start",
            hour: startHour,
            distanceKm: 0,
            elevationM: elevationAtDistance(profile: profile, targetKm: 0),
            precipMm: nil,
            isStorm: false
        ),
    ]

    let stageWaypoints = waypoints
        .filter { $0.distanceAlongRouteKm != nil }
        .filter {
            guard let km = $0.distanceAlongRouteKm else { return false }
            return km > 0.1 && km < totalKm - 0.1
        }
        .sorted { ($0.distanceAlongRouteKm ?? 0) < ($1.distanceAlongRouteKm ?? 0) }

    for waypoint in stageWaypoints {
        guard let km = waypoint.distanceAlongRouteKm else { continue }
        baseRows.append(RouteTimelineRow(
            id: waypoint.id,
            kind: timelineKind(type: waypoint.type),
            title: waypoint.name,
            detail: waypoint.description,
            hour: startHour + hoursAtKm(profile: timeProfile, targetKm: km),
            distanceKm: km,
            elevationM: waypoint.elevationM ?? elevationAtDistance(profile: profile, targetKm: km),
            precipMm: nil,
            isStorm: false
        ))
    }

    if let highest = profile.max(by: { $0.eleM < $1.eleM }) {
        let hasPeakNearby = baseRows.contains { abs($0.distanceKm - highest.dKm) < 0.5 }
        if !hasPeakNearby && highest.dKm > 0.5 && highest.dKm < totalKm - 0.5 {
            baseRows.append(RouteTimelineRow(
                id: "highest-point",
                kind: .peak,
                title: "Nejvyšší bod",
                detail: nil,
                hour: startHour + hoursAtKm(profile: timeProfile, targetKm: highest.dKm),
                distanceKm: highest.dKm,
                elevationM: Int(highest.eleM.rounded()),
                precipMm: nil,
                isStorm: false
            ))
        }
    }

    baseRows.append(RouteTimelineRow(
        id: "finish",
        kind: .finish,
        title: destinationName,
        detail: "Cíl",
        hour: arrivalHour,
        distanceKm: totalKm,
        elevationM: elevationAtDistance(profile: profile, targetKm: totalKm),
        precipMm: nil,
        isStorm: false
    ))

    let rain = rainOnset(snapshot: snapshot, profile: profile)
    var rows = baseRows
    if let rain {
        let near = nearestRow(rows: baseRows, distanceKm: rain.distanceKm)
        rows.append(RouteTimelineRow(
            id: "storm",
            kind: .storm,
            title: near?.title ?? "Srážky na trase",
            detail: String(format: "%.1f mm/h", rain.precipMm),
            hour: Double(rain.hour),
            distanceKm: rain.distanceKm,
            elevationM: rain.elevationM,
            precipMm: rain.precipMm,
            isStorm: true
        ))
    }

    rows.sort {
        if $0.distanceKm == $1.distanceKm { return $0.isStorm && !$1.isStorm }
        return $0.distanceKm < $1.distanceKm
    }
    return (rows, rain, arrivalHour)
}
