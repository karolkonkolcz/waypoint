import Foundation
import Supabase
import GRDB
import Network
import UIKit

// Local-first sync engine. UI reads from GRDB; writes enqueue local ops; sync
// pushes pending ops first, then pulls remote LWW changes.

@MainActor
final class SyncEngine {
    static let shared = SyncEngine()

    private let db = AppDatabase.shared
    private let supabase = SupabaseManager.shared.client
    private var networkMonitor: NWPathMonitor?

    private init() {}

    // Call once from app entry point.
    func start() {
        Task { await sync() }
        startForegroundObserver()
        startNetworkMonitor()
    }

    // Exposed for pull-to-refresh from ViewModels.
    func sync() async {
        do {
            try await push()
        } catch {
            // Non-fatal: queued writes remain in GRDB for the next sync.
        }
        await pull()
    }

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

    // MARK: - Push

    private func push() async throws {
        let ops = try await fetchPendingOps()
        guard !ops.isEmpty else { return }

        for op in ops {
            switch op.entity {
            case Trail.databaseTableName:
                try await pushTrail(op)
            case Stage.databaseTableName:
                try await pushStage(op)
            case Route.databaseTableName:
                try await pushRoute(op)
            case Waypoint.databaseTableName:
                try await pushWaypoint(op)
            case Todo.databaseTableName:
                try await pushTodo(op)
            default:
                try await deleteQueueOp(op)
            }
        }
    }

    private func pushTrail(_ op: SyncQueueOp) async throws {
        guard let row = try await fetchTrail(id: op.rowId) else {
            try await deleteQueueOp(op)
            return
        }
        let payload = TrailPayload(row, deletedAt: deletedAt(for: row.deletedAt, op: op))
        try await supabase.from(Trail.databaseTableName).upsert(payload, onConflict: "id").execute()
        try await finishPushedOp(op)
    }

    private func pushStage(_ op: SyncQueueOp) async throws {
        guard let row = try await fetchStage(id: op.rowId) else {
            try await deleteQueueOp(op)
            return
        }
        let payload = StagePayload(row, deletedAt: deletedAt(for: row.deletedAt, op: op))
        try await supabase.from(Stage.databaseTableName).upsert(payload, onConflict: "id").execute()
        try await finishPushedOp(op)
    }

    private func pushRoute(_ op: SyncQueueOp) async throws {
        guard let row = try await fetchRoute(id: op.rowId) else {
            try await deleteQueueOp(op)
            return
        }
        let payload = RoutePayload(row, deletedAt: deletedAt(for: row.deletedAt, op: op))
        try await supabase.from(Route.databaseTableName).upsert(payload, onConflict: "id").execute()
        try await finishPushedOp(op)
    }

    private func pushWaypoint(_ op: SyncQueueOp) async throws {
        guard let row = try await fetchWaypoint(id: op.rowId) else {
            try await deleteQueueOp(op)
            return
        }
        let payload = WaypointPayload(row, deletedAt: deletedAt(for: row.deletedAt, op: op))
        try await supabase.from(Waypoint.databaseTableName).upsert(payload, onConflict: "id").execute()
        try await finishPushedOp(op)
    }

    private func pushTodo(_ op: SyncQueueOp) async throws {
        guard let row = try await fetchTodo(id: op.rowId) else {
            try await deleteQueueOp(op)
            return
        }
        let payload = TodoPayload(row, deletedAt: deletedAt(for: row.deletedAt, op: op))
        try await supabase.from(Todo.databaseTableName).upsert(payload, onConflict: "id").execute()
        try await finishPushedOp(op)
    }

    private func deletedAt(for rowDeletedAt: Date?, op: SyncQueueOp) -> Date? {
        rowDeletedAt ?? (op.op == .delete ? Date() : nil)
    }

    private func finishPushedOp(_ op: SyncQueueOp) async throws {
        try await db.dbPool.write { db in
            if let seq = op.seq {
                try db.execute(sql: "DELETE FROM sync_queue WHERE seq = ?", arguments: [seq])
            }
            let remaining = try Int.fetchOne(
                db,
                sql: "SELECT COUNT(*) FROM sync_queue WHERE entity = ? AND row_id = ?",
                arguments: [op.entity, op.rowId]
            ) ?? 0
            if remaining == 0 {
                try db.execute(sql: "UPDATE \(op.entity) SET _dirty = 0 WHERE id = ?", arguments: [op.rowId])
            }
        }
    }

    private func deleteQueueOp(_ op: SyncQueueOp) async throws {
        guard let seq = op.seq else { return }
        try await db.dbPool.write { db in
            try db.execute(sql: "DELETE FROM sync_queue WHERE seq = ?", arguments: [seq])
        }
    }

    private func fetchPendingOps() async throws -> [SyncQueueOp] {
        let rows = try await db.dbPool.read { db in
            try Row.fetchAll(
                db,
                sql: "SELECT seq, entity, op, row_id, created_at FROM sync_queue ORDER BY seq ASC"
            )
        }
        return rows.map(makeSyncQueueOp)
    }

    private func fetchTrail(id: String) async throws -> Trail? {
        let row = try await fetchOne(table: Trail.databaseTableName, id: id)
        return row.map(makeTrail)
    }

    private func fetchStage(id: String) async throws -> Stage? {
        let row = try await fetchOne(table: Stage.databaseTableName, id: id)
        return row.map(makeStage)
    }

    private func fetchRoute(id: String) async throws -> Route? {
        let row = try await fetchOne(table: Route.databaseTableName, id: id)
        return row.map(makeRoute)
    }

    private func fetchWaypoint(id: String) async throws -> Waypoint? {
        let row = try await fetchOne(table: Waypoint.databaseTableName, id: id)
        return row.map(makeWaypoint)
    }

    private func fetchTodo(id: String) async throws -> Todo? {
        let row = try await fetchOne(table: Todo.databaseTableName, id: id)
        return row.map(makeTodo)
    }

    private func fetchOne(table: String, id: String) async throws -> Row? {
        try await db.dbPool.read { db in
            try Row.fetchOne(db, sql: "SELECT * FROM \(table) WHERE id = ?", arguments: [id])
        }
    }

    private func makeSyncQueueOp(_ row: Row) -> SyncQueueOp {
        SyncQueueOp(
            seq: row["seq"],
            entity: row["entity"],
            op: SyncOperation(rawValue: row["op"]) ?? .upsert,
            rowId: row["row_id"],
            createdAt: row["created_at"]
        )
    }

    private func makeTrail(_ row: Row) -> Trail {
        Trail(
            id: row["id"],
            userId: row["user_id"],
            name: row["name"],
            description: row["description"],
            startDate: row["start_date"],
            defaultPaceKmh: row["default_pace_kmh"],
            preferences: row["preferences"],
            coverImageUrl: row["cover_image_url"],
            createdAt: rowDate(row, "created_at"),
            updatedAt: rowDate(row, "updated_at"),
            deletedAt: rowOptionalDate(row, "deleted_at"),
            dirty: rowBool(row, "_dirty")
        )
    }

    private func makeStage(_ row: Row) -> Stage {
        Stage(
            id: row["id"],
            trailId: row["trail_id"],
            userId: row["user_id"],
            title: row["title"],
            orderIndex: row["order_index"],
            stageType: row["stage_type"],
            distanceKm: row["distance_km"],
            ascentM: row["ascent_m"],
            descentM: row["descent_m"],
            difficultyScore: row["difficulty_score"],
            difficultyClass: row["difficulty_class"],
            date: row["date"],
            startDistanceKm: row["start_distance_km"],
            endDistanceKm: row["end_distance_km"],
            locationName: row["location_name"],
            locationLat: row["location_lat"],
            locationLon: row["location_lon"],
            notes: row["notes"],
            timeline: row["timeline"],
            createdAt: rowDate(row, "created_at"),
            updatedAt: rowDate(row, "updated_at"),
            deletedAt: rowOptionalDate(row, "deleted_at"),
            dirty: rowBool(row, "_dirty")
        )
    }

    private func makeRoute(_ row: Row) -> Route {
        Route(
            id: row["id"],
            trailId: row["trail_id"],
            stageId: row["stage_id"],
            userId: row["user_id"],
            geojson: row["geojson"],
            totalDistanceKm: row["total_distance_km"],
            totalAscentM: row["total_ascent_m"],
            totalDescentM: row["total_descent_m"],
            elevationProfile: row["elevation_profile"],
            source: row["source"],
            createdAt: rowDate(row, "created_at"),
            updatedAt: rowDate(row, "updated_at"),
            deletedAt: rowOptionalDate(row, "deleted_at"),
            dirty: rowBool(row, "_dirty")
        )
    }

    private func makeWaypoint(_ row: Row) -> Waypoint {
        Waypoint(
            id: row["id"],
            trailId: row["trail_id"],
            userId: row["user_id"],
            name: row["name"],
            type: row["type"],
            latitude: row["latitude"],
            longitude: row["longitude"],
            elevationM: row["elevation_m"],
            distanceAlongRouteKm: row["distance_along_route_km"],
            description: row["description"],
            createdAt: rowDate(row, "created_at"),
            updatedAt: rowDate(row, "updated_at"),
            deletedAt: rowOptionalDate(row, "deleted_at"),
            dirty: rowBool(row, "_dirty")
        )
    }

    private func makeTodo(_ row: Row) -> Todo {
        Todo(
            id: row["id"],
            userId: row["user_id"],
            trailId: row["trail_id"],
            stageId: row["stage_id"],
            date: row["date"],
            text: row["text"],
            done: rowBool(row, "done"),
            orderIndex: row["order_index"],
            createdAt: rowDate(row, "created_at"),
            updatedAt: rowDate(row, "updated_at"),
            deletedAt: rowOptionalDate(row, "deleted_at"),
            dirty: rowBool(row, "_dirty")
        )
    }

    private func rowDate(_ row: Row, _ column: String) -> Date {
        Date(timeIntervalSince1970: row[column])
    }

    private func rowOptionalDate(_ row: Row, _ column: String) -> Date? {
        let timestamp: Double? = row[column]
        return timestamp.map { Date(timeIntervalSince1970: $0) }
    }

    private func rowBool(_ row: Row, _ column: String) -> Bool {
        let value: Int = row[column]
        return value != 0
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
            Task { await self?.sync() }
        }
    }

    private func startNetworkMonitor() {
        let monitor = NWPathMonitor()
        networkMonitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { await self?.sync() }
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

private struct TrailPayload: Encodable, Sendable {
    let id: String
    let user_id: String
    let name: String
    let description: String?
    let start_date: String?
    let default_pace_kmh: Double
    let preferences: JSONValue
    let cover_image_url: String?
    let created_at: String
    let updated_at: String
    let deleted_at: String?

    init(_ row: Trail, deletedAt: Date?) {
        id = row.id
        user_id = row.userId
        name = row.name
        description = row.description
        start_date = row.startDate
        default_pace_kmh = row.defaultPaceKmh
        preferences = JSONValue(jsonString: row.preferences, fallback: .object([:]))
        cover_image_url = row.coverImageUrl
        created_at = nowIso(row.createdAt)
        updated_at = nowIso(row.updatedAt)
        deleted_at = deletedAt.map(nowIso)
    }
}

private struct StagePayload: Encodable, Sendable {
    let id: String
    let trail_id: String
    let user_id: String
    let title: String
    let order_index: Int
    let stage_type: String
    let distance_km: Double
    let ascent_m: Double
    let descent_m: Double
    let difficulty_score: Int?
    let difficulty_class: String?
    let date: String?
    let start_distance_km: Double?
    let end_distance_km: Double?
    let location_name: String?
    let location_lat: Double?
    let location_lon: Double?
    let notes: String?
    let timeline: JSONValue
    let created_at: String
    let updated_at: String
    let deleted_at: String?

    init(_ row: Stage, deletedAt: Date?) {
        id = row.id
        trail_id = row.trailId
        user_id = row.userId
        title = row.title
        order_index = row.orderIndex
        stage_type = row.stageType
        distance_km = row.distanceKm
        ascent_m = row.ascentM
        descent_m = row.descentM
        difficulty_score = row.difficultyScore
        difficulty_class = row.difficultyClass
        date = row.date
        start_distance_km = row.startDistanceKm
        end_distance_km = row.endDistanceKm
        location_name = row.locationName
        location_lat = row.locationLat
        location_lon = row.locationLon
        notes = row.notes
        timeline = JSONValue(jsonString: row.timeline ?? "[]", fallback: .array([]))
        created_at = nowIso(row.createdAt)
        updated_at = nowIso(row.updatedAt)
        deleted_at = deletedAt.map(nowIso)
    }
}

private struct RoutePayload: Encodable, Sendable {
    let id: String
    let trail_id: String
    let stage_id: String?
    let user_id: String
    let geojson: JSONValue
    let total_distance_km: Double
    let total_ascent_m: Int
    let total_descent_m: Int
    let elevation_profile: JSONValue
    let source: String
    let created_at: String
    let updated_at: String
    let deleted_at: String?

    init(_ row: Route, deletedAt: Date?) {
        id = row.id
        trail_id = row.trailId
        stage_id = row.stageId
        user_id = row.userId
        geojson = JSONValue(jsonString: row.geojson, fallback: .object([:]))
        total_distance_km = row.totalDistanceKm
        total_ascent_m = row.totalAscentM
        total_descent_m = row.totalDescentM
        elevation_profile = JSONValue(jsonString: row.elevationProfile, fallback: .array([]))
        source = row.source
        created_at = nowIso(row.createdAt)
        updated_at = nowIso(row.updatedAt)
        deleted_at = deletedAt.map(nowIso)
    }
}

private struct WaypointPayload: Encodable, Sendable {
    let id: String
    let trail_id: String
    let user_id: String
    let name: String
    let type: String
    let latitude: Double
    let longitude: Double
    let elevation_m: Int?
    let distance_along_route_km: Double?
    let description: String?
    let created_at: String
    let updated_at: String
    let deleted_at: String?

    init(_ row: Waypoint, deletedAt: Date?) {
        id = row.id
        trail_id = row.trailId
        user_id = row.userId
        name = row.name
        type = row.type
        latitude = row.latitude
        longitude = row.longitude
        elevation_m = row.elevationM
        distance_along_route_km = row.distanceAlongRouteKm
        description = row.description
        created_at = nowIso(row.createdAt)
        updated_at = nowIso(row.updatedAt)
        deleted_at = deletedAt.map(nowIso)
    }
}

private struct TodoPayload: Encodable, Sendable {
    let id: String
    let user_id: String
    let trail_id: String
    let stage_id: String?
    let date: String?
    let text: String
    let done: Bool
    let order_index: Int
    let created_at: String
    let updated_at: String
    let deleted_at: String?

    init(_ row: Todo, deletedAt: Date?) {
        id = row.id
        user_id = row.userId
        trail_id = row.trailId
        stage_id = row.stageId
        date = row.date
        text = row.text
        done = row.done
        order_index = row.orderIndex
        created_at = nowIso(row.createdAt)
        updated_at = nowIso(row.updatedAt)
        deleted_at = deletedAt.map(nowIso)
    }
}

private enum JSONValue: Codable, Sendable {
    case object([String: JSONValue])
    case array([JSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(jsonString: String, fallback: JSONValue) {
        guard
            let data = jsonString.data(using: .utf8),
            let decoded = try? JSONDecoder().decode(JSONValue.self, from: data)
        else {
            self = fallback
            return
        }
        self = decoded
    }

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
