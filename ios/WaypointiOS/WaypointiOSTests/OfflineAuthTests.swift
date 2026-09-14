import Foundation
import GRDB
import Testing
@testable import WaypointiOS

/// The offline launch contract (ARCHITECTURE.md D7): once a device has verified
/// a code, it opens into its data indefinitely without a network — and losing
/// the server session is never allowed to look like a sign-out.
@Suite("Offline auth")
@MainActor
struct OfflineAuthTests {

    private let user = "018f0000-0000-7000-8000-0000000000aa"
    private let otherUser = "018f0000-0000-7000-8000-0000000000bb"

    @Test func storedSessionOpensTheAppWithoutTheNetwork() {
        // Expired or not — bootstrap never asks the server, so this is the state
        // after months in a dead zone.
        let route = AuthViewModel.launchRoute(
            sessionUserId: user,
            identityUserId: user,
            dataOwnerUserId: user
        )
        #expect(route == .signedIn)
    }

    @Test func firstLaunchAfterUpgradeAdoptsASessionWithNoRecordedOwner() {
        let route = AuthViewModel.launchRoute(
            sessionUserId: user,
            identityUserId: nil,
            dataOwnerUserId: nil
        )
        #expect(route == .signedIn)
    }

    @Test func droppedSessionOverOurOwnCacheAsksForReauthNotLogin() {
        // supabase-swift erases its session when the server says it is gone —
        // the realistic outcome of coming back online after weeks away.
        let route = AuthViewModel.launchRoute(
            sessionUserId: nil,
            identityUserId: user,
            dataOwnerUserId: user
        )
        #expect(route == .reauth)
    }

    @Test func identityWithNoCacheBehindItIsAFreshInstall() {
        // Keychain items can outlive an app deletion; an empty cache is what
        // proves this identity has nothing to come back to.
        let route = AuthViewModel.launchRoute(
            sessionUserId: nil,
            identityUserId: user,
            dataOwnerUserId: nil
        )
        #expect(route == .signedOut)
    }

    @Test func cacheBelongingToSomeoneElseNeverUnlocksOnAStaleIdentity() {
        let route = AuthViewModel.launchRoute(
            sessionUserId: nil,
            identityUserId: user,
            dataOwnerUserId: otherUser
        )
        #expect(route == .signedOut)
    }

    @Test func nothingStoredMeansLogin() {
        let route = AuthViewModel.launchRoute(
            sessionUserId: nil,
            identityUserId: nil,
            dataOwnerUserId: nil
        )
        #expect(route == .signedOut)
    }

    // MARK: - Ownership bookkeeping

    @Test func dataOwnerSurvivesUntilTheCacheIsErased() async throws {
        let database = try makeDatabase()
        #expect(try database.dataOwnerUserId() == nil)

        try database.setDataOwnerUserId(user)
        #expect(try database.dataOwnerUserId() == user)

        // A plain sign-out leaves the cache — and its owner — in place, so the
        // same account picks its trails back up on the next sign-in.
        try await database.eraseAllData()
        #expect(try database.dataOwnerUserId() == nil)
    }

    @Test func pendingSyncOpCountReportsUnsentFieldEdits() throws {
        let database = try makeDatabase()
        #expect(try database.pendingSyncOpCount() == 0)

        try database.dbPool.write { db in
            try enqueueSyncOp(db, entity: "trails", op: .upsert, rowId: "trail-1")
            try enqueueSyncOp(db, entity: "stages", op: .delete, rowId: "stage-1")
        }
        #expect(try database.pendingSyncOpCount() == 2)
    }

    private func makeDatabase() throws -> AppDatabase {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("waypoint-test-\(UUID().uuidString).sqlite")
        return try AppDatabase(url: url)
    }
}
