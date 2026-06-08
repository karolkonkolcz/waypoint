//
//  GpxImporter.swift
//  WaypointiOS
//
//  Port of web/lib/gpx/import.ts. Creates one trail, one stage per <trk> (day),
//  and one route per stage carrying that day's geometry. All writes go through
//  the local-first repositories (GRDB + sync queue) — never Supabase directly.
//

import Foundation

struct TrekPreview: Sendable {
    var trailName: String
    var tracks: [ParsedTrack]

    var totalDistanceKm: Double {
        (tracks.reduce(0) { $0 + $1.gpx.totalDistanceKm } * 10).rounded() / 10
    }
    var totalAscentM: Int {
        tracks.reduce(0) { $0 + $1.gpx.totalAscentM }
    }
    var dayCount: Int { tracks.count }
}

struct TrekImportResult: Sendable {
    var trailId: String
    var stageCount: Int
}

enum GpxImporter {
    /// Parses GPX text into a preview (days + totals) without writing anything.
    static func buildPreview(xmlText: String, fileName: String) throws -> TrekPreview {
        let tracks = try parseGpxTracks(xmlText)
        return TrekPreview(trailName: deriveTrailName(fileName: fileName), tracks: tracks)
    }

    /// Imports a multi-day trek: trail → stage-per-day → route-per-stage.
    /// Difficulty is computed by StageRepository.create. Returns the new trail id.
    @discardableResult
    static func importTrek(
        tracks: [ParsedTrack],
        userId: String,
        trailName: String,
        startDate: String?,
        defaultPaceKmh: Double = 4,
        trailRepo: TrailRepository = TrailRepository(),
        stageRepo: StageRepository = StageRepository(),
        routeRepo: RouteRepository = RouteRepository()
    ) throws -> TrekImportResult {
        guard !tracks.isEmpty else { throw GpxParseError.noTracks }

        let trail = try trailRepo.create(.init(
            userId: userId,
            name: trailName,
            description: nil,
            startDate: startDate,
            defaultPaceKmh: defaultPaceKmh
        ))

        var routeInputs: [RouteRepository.CreateInput] = []
        for (i, track) in tracks.enumerated() {
            let stage = try stageRepo.create(.init(
                trailId: trail.id,
                userId: userId,
                title: track.name ?? "Den \(i + 1)",
                orderIndex: i,
                distanceKm: track.gpx.totalDistanceKm,
                ascentM: Double(track.gpx.totalAscentM),
                descentM: Double(track.gpx.totalDescentM)
            ))

            routeInputs.append(.init(
                trailId: trail.id,
                stageId: stage.id,
                userId: userId,
                geojson: geojsonString(coordinates: track.gpx.coordinates),
                totalDistanceKm: track.gpx.totalDistanceKm,
                totalAscentM: track.gpx.totalAscentM,
                totalDescentM: track.gpx.totalDescentM,
                elevationProfile: elevationProfileString(track.gpx.elevationProfile),
                source: "gpx"
            ))
        }

        _ = try routeRepo.bulkCreate(routeInputs)
        return TrekImportResult(trailId: trail.id, stageCount: tracks.count)
    }
}
