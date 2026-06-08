//
//  Stage.swift
//  WaypointiOS
//
//  Read-only mirror of the `stages` row. Column names stay snake_case to match
//  Postgres; CodingKeys map them to Swift camelCase.
//

import Foundation

struct Stage: Identifiable, Decodable, Sendable {
    let id: String
    let trailId: String
    let title: String
    let orderIndex: Int
    let stageType: String
    let distanceKm: Double
    let ascentM: Double
    let descentM: Double
    let difficultyScore: Int?
    let difficultyClass: String?
    let date: String?
    let startDistanceKm: Double?
    let endDistanceKm: Double?
    let locationName: String?
    let locationLat: Double?
    let locationLon: Double?
    let notes: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, title, notes
        case trailId = "trail_id"
        case orderIndex = "order_index"
        case stageType = "stage_type"
        case distanceKm = "distance_km"
        case ascentM = "ascent_m"
        case descentM = "descent_m"
        case difficultyScore = "difficulty_score"
        case difficultyClass = "difficulty_class"
        case date
        case startDistanceKm = "start_distance_km"
        case endDistanceKm = "end_distance_km"
        case locationName = "location_name"
        case locationLat = "location_lat"
        case locationLon = "location_lon"
        case createdAt = "created_at"
    }
}

extension Stage {
    /// Live-computed difficulty (server value may lag; use for display).
    func computedDifficulty(paceKmh: Double) -> DifficultyResult {
        scoreDifficulty(DifficultyInput(distanceKm: distanceKm, ascentM: ascentM, descentM: descentM))
    }

    func computedETA(paceKmh: Double, startTime: Date) -> ETAResult {
        computeETA(distanceKm: distanceKm, ascentM: ascentM, paceKmh: paceKmh, startTime: startTime)
    }
}
