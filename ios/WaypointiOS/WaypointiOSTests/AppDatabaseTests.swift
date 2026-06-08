import Foundation
import GRDB
import Testing
@testable import WaypointiOS

@Suite("AppDatabase")
@MainActor
struct AppDatabaseTests {

    @Test func phase2MigrationCreatesLocalMirrorTables() throws {
        let database = try makeDatabase()

        try database.dbPool.read { db in
            let tables = try Set(String.fetchAll(db, sql: """
                SELECT name FROM sqlite_master WHERE type = 'table'
            """))

            #expect(tables.contains("trails"))
            #expect(tables.contains("routes"))
            #expect(tables.contains("stages"))
            #expect(tables.contains("waypoints"))
            #expect(tables.contains("todos"))
            #expect(tables.contains("weather"))
            #expect(tables.contains("alerts"))
            #expect(tables.contains("ephemeral_weather"))
            #expect(tables.contains("sync_queue"))
        }
    }

    @Test func trailAndStageRowsKeepFullSyncShape() throws {
        let database = try makeDatabase()
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        var trail = Trail(
            id: "018f0000-0000-7000-8000-000000000001",
            userId: "user-1",
            name: "Via Alpina",
            description: "Test trail",
            startDate: "2026-07-01",
            defaultPaceKmh: 4.2,
            preferences: #"{"start_hour":8}"#,
            coverImageUrl: nil,
            createdAt: now,
            updatedAt: now,
            deletedAt: nil,
            dirty: false
        )

        var stage = Stage(
            id: "018f0000-0000-7000-8000-000000000002",
            trailId: trail.id,
            userId: trail.userId,
            title: "Day 1",
            orderIndex: 0,
            stageType: "trek",
            distanceKm: 18.5,
            ascentM: 800,
            descentM: 500,
            difficultyScore: nil,
            difficultyClass: nil,
            date: nil,
            startDistanceKm: nil,
            endDistanceKm: nil,
            locationName: nil,
            locationLat: nil,
            locationLon: nil,
            notes: nil,
            timeline: "[]",
            createdAt: now,
            updatedAt: now,
            deletedAt: nil,
            dirty: false
        )

        try database.dbPool.write { db in
            try trail.insert(db)
            try stage.insert(db)
        }

        try database.dbPool.read { db in
            let maybeTrail = try Trail.fetchOne(db, key: trail.id)
            let maybeStage = try Stage.fetchOne(db, key: stage.id)
            let storedTrail = try #require(maybeTrail)
            let storedStage = try #require(maybeStage)

            #expect(storedTrail.preferences == #"{"start_hour":8}"#)
            #expect(storedStage.userId == "user-1")
            #expect(storedStage.timeline == "[]")
        }
    }

    private func makeDatabase() throws -> AppDatabase {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("waypoint-test-\(UUID().uuidString).sqlite")
        return try AppDatabase(url: url)
    }
}
