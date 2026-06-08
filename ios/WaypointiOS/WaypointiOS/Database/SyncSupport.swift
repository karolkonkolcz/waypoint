import Foundation
import GRDB

enum SyncOperation: String, Codable, Sendable {
    case upsert
    case delete
}

struct SyncQueueOp: Codable, FetchableRecord, MutablePersistableRecord, Sendable {
    var seq: Int64?
    var entity: String
    var op: SyncOperation
    var rowId: String
    var createdAt: String

    static let databaseTableName = "sync_queue"

    enum CodingKeys: String, CodingKey {
        case seq, entity, op
        case rowId = "row_id"
        case createdAt = "created_at"
    }

    mutating func didInsert(_ inserted: InsertionSuccess) {
        seq = inserted.rowID
    }
}

func nowIso(_ date: Date = Date()) -> String {
    syncIsoFormatter.string(from: date)
}

func newUUIDv7() -> String {
    let milliseconds = UInt64(Date().timeIntervalSince1970 * 1000)
    var random = [UInt8](repeating: 0, count: 10)
    for i in random.indices {
        random[i] = UInt8.random(in: 0...255)
    }

    var bytes = [UInt8](repeating: 0, count: 16)
    bytes[0] = UInt8((milliseconds >> 40) & 0xff)
    bytes[1] = UInt8((milliseconds >> 32) & 0xff)
    bytes[2] = UInt8((milliseconds >> 24) & 0xff)
    bytes[3] = UInt8((milliseconds >> 16) & 0xff)
    bytes[4] = UInt8((milliseconds >> 8) & 0xff)
    bytes[5] = UInt8(milliseconds & 0xff)
    bytes[6] = 0x70 | (random[0] & 0x0f)
    bytes[7] = random[1]
    bytes[8] = 0x80 | (random[2] & 0x3f)
    for i in 9..<16 {
        bytes[i] = random[i - 6]
    }

    let hex = bytes.map { String(format: "%02x", $0) }
    return "\(hex[0])\(hex[1])\(hex[2])\(hex[3])-\(hex[4])\(hex[5])-\(hex[6])\(hex[7])-\(hex[8])\(hex[9])-\(hex[10])\(hex[11])\(hex[12])\(hex[13])\(hex[14])\(hex[15])"
}

func enqueueSyncOp(
    _ db: Database,
    entity: String,
    op: SyncOperation,
    rowId: String,
    createdAt: Date = Date()
) throws {
    var queueOp = SyncQueueOp(
        seq: nil,
        entity: entity,
        op: op,
        rowId: rowId,
        createdAt: nowIso(createdAt)
    )
    try queueOp.insert(db)
}

private let syncIsoFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
