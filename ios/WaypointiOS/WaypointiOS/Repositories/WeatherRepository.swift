import Foundation
import GRDB

struct WeatherRepository {
    private let db: AppDatabase
    private let cacheTTL: TimeInterval = 6 * 60 * 60

    init(db: AppDatabase = .shared) {
        self.db = db
    }

    struct SaveSampleInput: Sendable {
        var trailId: String
        var stageId: String
        var userId: String
        var latitude: Double
        var longitude: Double
        var date: String
        var sample: WeatherSampleCache
    }

    func findByStage(stageId: String) throws -> [WeatherRow] {
        try db.dbPool.read { db in
            try WeatherRow
                .filter(Column("stage_id") == stageId)
                .order(Column("fetched_at").desc)
                .fetchAll(db)
        }
    }

    func isFresh(_ rows: [WeatherRow], now: Date = Date()) -> Bool {
        guard let newest = rows.map(\.fetchedAt).max() else { return false }
        return now.timeIntervalSince(newest) < cacheTTL
    }

    func saveSamples(_ inputs: [SaveSampleInput]) throws -> [WeatherRow] {
        guard let first = inputs.first else { return [] }
        let now = Date()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]

        return try db.dbPool.write { db in
            try db.execute(sql: "DELETE FROM weather WHERE stage_id = ?", arguments: [first.stageId])

            var rows: [WeatherRow] = []
            for input in inputs {
                let forecastData = try encoder.encode(input.sample)
                guard let forecastJson = String(data: forecastData, encoding: .utf8) else {
                    continue
                }
                var row = WeatherRow(
                    id: newUUIDv7(),
                    trailId: input.trailId,
                    stageId: input.stageId,
                    userId: input.userId,
                    latitude: input.latitude,
                    longitude: input.longitude,
                    forecastJson: forecastJson,
                    validFrom: WeatherRepository.date(input.date, hour: 0),
                    validTo: WeatherRepository.date(input.date, hour: 23, minute: 59, second: 59),
                    fetchedAt: now
                )
                try row.insert(db)
                rows.append(row)
            }
            return rows
        }
    }

    private static func date(_ yyyyMmDd: String, hour: Int, minute: Int = 0, second: Int = 0) -> Date? {
        var components = DateComponents()
        components.calendar = Calendar(identifier: .gregorian)
        components.timeZone = TimeZone(secondsFromGMT: 0)
        let parts = yyyyMmDd.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        components.hour = hour
        components.minute = minute
        components.second = second
        return components.date
    }
}
