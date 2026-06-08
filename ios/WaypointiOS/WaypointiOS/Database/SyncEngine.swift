import Foundation
import Supabase
import GRDB
import Network
import UIKit

// Pull-only sync engine (Phase 2). UI reads from GRDB; Supabase only refreshes
// the local mirror. Push and conflict-producing local writes arrive in Phase 3.

@MainActor
final class SyncEngine {
    static let shared = SyncEngine()

    private let db = AppDatabase.shared
    private let supabase = SupabaseManager.shared.client
    private var networkMonitor: NWPathMonitor?

    private init() {}

    // Call once from app entry point.
    func start() {
        Task { await pull() }
        startForegroundObserver()
        startNetworkMonitor()
    }

    // Exposed for pull-to-refresh from ViewModels.
    func pull() async {
        guard let session = supabase.auth.currentSession else { return }
        let userId = session.user.id.uuidString
        do {
            try await pullTrails(userId: userId)
            try await pullStages(userId: userId)
            try await pullRoutes(userId: userId)
            try await pullWaypoints(userId: userId)
            try await pullTodos(userId: userId)
        } catch {
            // Non-fatal: UI continues to render the local GRDB cache.
        }
    }

    // MARK: - Pull

    private func pullTrails(userId: String) async throws {
        let lastPulled = syncLastPulledAt(for: "trails")
        let pulledAt = isoString(Date())

        var query = supabase
            .from("trails")
            .select()
            .eq("user_id", value: userId)

        if let lastPulled {
            query = query.gt("updated_at", value: isoString(lastPulled))
        }

        let remote: [RemoteTrail] = try await query.execute().value
        let records = remote.map { $0.toTrail() }
        try await persistPulled(
            records,
            entity: "trails",
            pulledAt: pulledAt,
            id: \.id,
            updatedAt: \.updatedAt
        ) { $0.dirty = false }
    }

    private func pullStages(userId: String) async throws {
        let lastPulled = syncLastPulledAt(for: "stages")
        let pulledAt = isoString(Date())

        var query = supabase
            .from("stages")
            .select()
            .eq("user_id", value: userId)

        if let lastPulled {
            query = query.gt("updated_at", value: isoString(lastPulled))
        }

        let remote: [RemoteStage] = try await query.execute().value
        let records = remote.map { $0.toStage() }
        try await persistPulled(
            records,
            entity: "stages",
            pulledAt: pulledAt,
            id: \.id,
            updatedAt: \.updatedAt
        ) { $0.dirty = false }
    }

    private func pullRoutes(userId: String) async throws {
        let lastPulled = syncLastPulledAt(for: "routes")
        let pulledAt = isoString(Date())

        var query = supabase
            .from("routes")
            .select()
            .eq("user_id", value: userId)

        if let lastPulled {
            query = query.gt("updated_at", value: isoString(lastPulled))
        }

        let remote: [RemoteRoute] = try await query.execute().value
        let records = remote.map { $0.toRoute() }
        try await persistPulled(
            records,
            entity: "routes",
            pulledAt: pulledAt,
            id: \.id,
            updatedAt: \.updatedAt
        ) { $0.dirty = false }
    }

    private func pullWaypoints(userId: String) async throws {
        let lastPulled = syncLastPulledAt(for: "waypoints")
        let pulledAt = isoString(Date())

        var query = supabase
            .from("waypoints")
            .select()
            .eq("user_id", value: userId)

        if let lastPulled {
            query = query.gt("updated_at", value: isoString(lastPulled))
        }

        let remote: [RemoteWaypoint] = try await query.execute().value
        let records = remote.map { $0.toWaypoint() }
        try await persistPulled(
            records,
            entity: "waypoints",
            pulledAt: pulledAt,
            id: \.id,
            updatedAt: \.updatedAt
        ) { $0.dirty = false }
    }

    private func pullTodos(userId: String) async throws {
        let lastPulled = syncLastPulledAt(for: "todos")
        let pulledAt = isoString(Date())

        var query = supabase
            .from("todos")
            .select()
            .eq("user_id", value: userId)

        if let lastPulled {
            query = query.gt("updated_at", value: isoString(lastPulled))
        }

        let remote: [RemoteTodo] = try await query.execute().value
        let records = remote.map { $0.toTodo() }
        try await persistPulled(
            records,
            entity: "todos",
            pulledAt: pulledAt,
            id: \.id,
            updatedAt: \.updatedAt
        ) { $0.dirty = false }
    }

    private func persistPulled<Record: FetchableRecord & MutablePersistableRecord>(
        _ records: [Record],
        entity: String,
        pulledAt: String,
        id: KeyPath<Record, String>,
        updatedAt: KeyPath<Record, Date>,
        markClean: @escaping (inout Record) -> Void
    ) async throws {
        let dbRef = db
        try await dbRef.dbPool.write { db in
            for var record in records {
                let local = try Record.fetchOne(db, key: record[keyPath: id])
                if let local, record[keyPath: updatedAt] < local[keyPath: updatedAt] {
                    continue
                }
                markClean(&record)
                try record.upsert(db)
            }
            try db.execute(
                sql: "INSERT OR REPLACE INTO sync_metadata(key, value) VALUES (?, ?)",
                arguments: ["\(entity)_lastPulledAt", pulledAt]
            )
        }
    }

    // MARK: - sync_metadata

    private func syncLastPulledAt(for entity: String) -> Date? {
        let key = "\(entity)_lastPulledAt"
        return try? db.dbPool.read { db in
            guard let raw = try String.fetchOne(
                db,
                sql: "SELECT value FROM sync_metadata WHERE key = ?",
                arguments: [key]
            ) else { return nil }
            return isoDate(raw)
        }
    }

    // MARK: - Lifecycle triggers

    private func startForegroundObserver() {
        NotificationCenter.default.addObserver(
            forName: UIScene.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { await self?.pull() }
        }
    }

    private func startNetworkMonitor() {
        let monitor = NWPathMonitor()
        networkMonitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { await self?.pull() }
        }
        monitor.start(queue: DispatchQueue(label: "waypoint.netmonitor", qos: .background))
    }

    // MARK: - ISO 8601

    private func isoString(_ date: Date) -> String { SyncEngine.isoFormatter.string(from: date) }
    private func isoDate(_ s: String) -> Date? { parseRemoteDate(s) }

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

// MARK: - Remote DTOs

private struct RemoteTrail: Decodable, Sendable {
    let id: String
    let userId: String
    let name: String
    let description: String?
    let startDate: String?
    let defaultPaceKmh: Double
    let preferences: JSONValue?
    let coverImageUrl: String?
    let createdAt: String
    let updatedAt: String
    let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, description, preferences
        case userId = "user_id"
        case startDate = "start_date"
        case defaultPaceKmh = "default_pace_kmh"
        case coverImageUrl = "cover_image_url"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }

    func toTrail() -> Trail {
        Trail(
            id: id,
            userId: userId,
            name: name,
            description: description,
            startDate: startDate,
            defaultPaceKmh: defaultPaceKmh,
            preferences: preferences?.jsonString ?? "{}",
            coverImageUrl: coverImageUrl,
            createdAt: parseRemoteDate(createdAt) ?? .distantPast,
            updatedAt: parseRemoteDate(updatedAt) ?? .distantPast,
            deletedAt: deletedAt.flatMap(parseRemoteDate),
            dirty: false
        )
    }
}

private struct RemoteStage: Decodable, Sendable {
    let id: String
    let trailId: String
    let userId: String
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
    let timeline: JSONValue?
    let createdAt: String
    let updatedAt: String
    let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title, notes, date, timeline
        case trailId = "trail_id"
        case userId = "user_id"
        case orderIndex = "order_index"
        case stageType = "stage_type"
        case distanceKm = "distance_km"
        case ascentM = "ascent_m"
        case descentM = "descent_m"
        case difficultyScore = "difficulty_score"
        case difficultyClass = "difficulty_class"
        case startDistanceKm = "start_distance_km"
        case endDistanceKm = "end_distance_km"
        case locationName = "location_name"
        case locationLat = "location_lat"
        case locationLon = "location_lon"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }

    func toStage() -> Stage {
        Stage(
            id: id,
            trailId: trailId,
            userId: userId,
            title: title,
            orderIndex: orderIndex,
            stageType: stageType,
            distanceKm: distanceKm,
            ascentM: ascentM,
            descentM: descentM,
            difficultyScore: difficultyScore,
            difficultyClass: difficultyClass,
            date: date,
            startDistanceKm: startDistanceKm,
            endDistanceKm: endDistanceKm,
            locationName: locationName,
            locationLat: locationLat,
            locationLon: locationLon,
            notes: notes,
            timeline: timeline?.jsonString ?? "[]",
            createdAt: parseRemoteDate(createdAt) ?? .distantPast,
            updatedAt: parseRemoteDate(updatedAt) ?? .distantPast,
            deletedAt: deletedAt.flatMap(parseRemoteDate),
            dirty: false
        )
    }
}

private struct RemoteRoute: Decodable, Sendable {
    let id: String
    let trailId: String
    let stageId: String?
    let userId: String
    let geojson: JSONValue
    let totalDistanceKm: Double
    let totalAscentM: Int
    let totalDescentM: Int
    let elevationProfile: JSONValue?
    let source: String
    let createdAt: String
    let updatedAt: String
    let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, geojson, source
        case trailId = "trail_id"
        case stageId = "stage_id"
        case userId = "user_id"
        case totalDistanceKm = "total_distance_km"
        case totalAscentM = "total_ascent_m"
        case totalDescentM = "total_descent_m"
        case elevationProfile = "elevation_profile"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }

    func toRoute() -> Route {
        Route(
            id: id,
            trailId: trailId,
            stageId: stageId,
            userId: userId,
            geojson: geojson.jsonString,
            totalDistanceKm: totalDistanceKm,
            totalAscentM: totalAscentM,
            totalDescentM: totalDescentM,
            elevationProfile: elevationProfile?.jsonString ?? "[]",
            source: source,
            createdAt: parseRemoteDate(createdAt) ?? .distantPast,
            updatedAt: parseRemoteDate(updatedAt) ?? .distantPast,
            deletedAt: deletedAt.flatMap(parseRemoteDate),
            dirty: false
        )
    }
}

private struct RemoteWaypoint: Decodable, Sendable {
    let id: String
    let trailId: String
    let userId: String
    let name: String
    let type: String
    let latitude: Double
    let longitude: Double
    let elevationM: Int?
    let distanceAlongRouteKm: Double?
    let description: String?
    let createdAt: String
    let updatedAt: String
    let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, type, latitude, longitude, description
        case trailId = "trail_id"
        case userId = "user_id"
        case elevationM = "elevation_m"
        case distanceAlongRouteKm = "distance_along_route_km"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }

    func toWaypoint() -> Waypoint {
        Waypoint(
            id: id,
            trailId: trailId,
            userId: userId,
            name: name,
            type: type,
            latitude: latitude,
            longitude: longitude,
            elevationM: elevationM,
            distanceAlongRouteKm: distanceAlongRouteKm,
            description: description,
            createdAt: parseRemoteDate(createdAt) ?? .distantPast,
            updatedAt: parseRemoteDate(updatedAt) ?? .distantPast,
            deletedAt: deletedAt.flatMap(parseRemoteDate),
            dirty: false
        )
    }
}

private struct RemoteTodo: Decodable, Sendable {
    let id: String
    let userId: String
    let trailId: String
    let stageId: String?
    let date: String?
    let text: String
    let done: Bool
    let orderIndex: Int
    let createdAt: String
    let updatedAt: String
    let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, date, text, done
        case userId = "user_id"
        case trailId = "trail_id"
        case stageId = "stage_id"
        case orderIndex = "order_index"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }

    func toTodo() -> Todo {
        Todo(
            id: id,
            userId: userId,
            trailId: trailId,
            stageId: stageId,
            date: date,
            text: text,
            done: done,
            orderIndex: orderIndex,
            createdAt: parseRemoteDate(createdAt) ?? .distantPast,
            updatedAt: parseRemoteDate(updatedAt) ?? .distantPast,
            deletedAt: deletedAt.flatMap(parseRemoteDate),
            dirty: false
        )
    }
}

// MARK: - JSON + Date helpers

private enum JSONValue: Codable, Sendable {
    case object([String: JSONValue])
    case array([JSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let object = try? container.decode([String: JSONValue].self) {
            self = .object(object)
        } else if let array = try? container.decode([JSONValue].self) {
            self = .array(array)
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else {
            self = .number(try container.decode(Double.self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }

    var jsonString: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard
            let data = try? encoder.encode(self),
            let text = String(data: data, encoding: .utf8)
        else { return "null" }
        return text
    }
}

private func parseRemoteDate(_ s: String) -> Date? {
    remoteDateFormatter.date(from: s) ?? remoteDateFormatterNoFrac.date(from: s)
}

private let remoteDateFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

private let remoteDateFormatterNoFrac: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()
