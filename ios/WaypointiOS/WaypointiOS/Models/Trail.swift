//
//  Trail.swift
//  WaypointiOS
//
//  Read-only mirror of the `trails` row (Phase 0). Only the columns we render are
//  decoded; PostgREST returns the rest and Codable ignores the extras. Dates stay
//  as ISO strings for now — proper Date handling lands with the GRDB schema (Phase 2).
//

import Foundation

struct Trail: Identifiable, Decodable, Sendable {
    let id: String
    let name: String
    let description: String?
    let startDate: String?
    let defaultPaceKmh: Double
    let coverImageUrl: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, name, description
        case startDate = "start_date"
        case defaultPaceKmh = "default_pace_kmh"
        case coverImageUrl = "cover_image_url"
        case createdAt = "created_at"
    }
}
