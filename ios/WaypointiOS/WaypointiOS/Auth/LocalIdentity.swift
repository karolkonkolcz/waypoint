//
//  LocalIdentity.swift
//  WaypointiOS
//
//  Who this device belongs to — independent of the Supabase SDK's session.
//
//  Why this exists: supabase-swift deletes its own stored session whenever the
//  server reports that the session is gone (`sessionCleanupErrorCodes` in the
//  SDK's APIClient), which is exactly what a device does on its first request
//  after a long trip. Losing the session must not cost us the identity, because
//  `user_id` stamps every locally created row — without it the app could not
//  even write to its own cache. So identity is stored here and cleared only on a
//  deliberate sign-out. See ARCHITECTURE.md D7.
//

import Foundation
import Security

struct LocalIdentity: Codable, Equatable, Sendable {
    /// Lower-cased UUID, matching the shape rows carry in Postgres.
    var userId: String
    var email: String?
    var signedInAt: Date
}

/// Keychain-backed store for the single `LocalIdentity`.
final class LocalIdentityStore: Sendable {
    static let shared = LocalIdentityStore()

    private let service = "cz.waypointapp.waypoint.identity"
    private let account = "current"

    var current: LocalIdentity? {
        guard let data = read() else { return nil }
        return try? JSONDecoder().decode(LocalIdentity.self, from: data)
    }

    /// Record an identity, preserving `signedInAt` when it is the same account
    /// (bootstrap re-adopts the SDK session on every launch).
    func adopt(userId: String, email: String?) {
        let existing = current
        let identity = LocalIdentity(
            userId: userId,
            email: email ?? existing?.email,
            signedInAt: existing?.userId == userId ? existing?.signedInAt ?? Date() : Date()
        )
        guard identity != existing else { return }
        save(identity)
    }

    func save(_ identity: LocalIdentity) {
        guard let data = try? JSONEncoder().encode(identity) else { return }
        write(data)
    }

    func clear() {
        SecItemDelete(baseQuery() as CFDictionary)
    }

    // MARK: - Keychain

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    private func read() -> Data? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
        return item as? Data
    }

    private func write(_ data: Data) {
        SecItemDelete(baseQuery() as CFDictionary)
        var query = baseQuery()
        query[kSecValueData as String] = data
        // The sync engine reads this from background tasks, so it has to survive
        // a locked screen after the first unlock.
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(query as CFDictionary, nil)
    }
}
