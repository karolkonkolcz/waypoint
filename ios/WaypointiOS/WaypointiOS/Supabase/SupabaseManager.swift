//
//  SupabaseManager.swift
//  WaypointiOS
//
//  Holds the single shared Supabase client. The publishable key is safe to ship
//  in the client — RLS (owner-only, auth.uid() = user_id) protects the data.
//  See IOS_STRATEGY.md §I2/I3 and ARCHITECTURE.md for the backend contract.
//

import Foundation
import Supabase

enum SupabaseConfig {
    static let url = URL(string: "https://bbiyjwjqollkxgfakpju.supabase.co")!
    // Publishable key (sb_publishable_…), not the legacy anon key — see I3.
    static let publishableKey = "sb_publishable_gpVU9LZ0DO4yGR1sQMCcMw__yOGt0GQ"
}

final class SupabaseManager {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: SupabaseConfig.url,
            supabaseKey: SupabaseConfig.publishableKey,
            options: SupabaseClientOptions(
                // Opt in to the upcoming default: emit the locally stored session
                // as the initial session immediately, instead of after a refresh.
                // Silences supabase-swift's legacy-behavior runtime warning. We don't
                // consume `.initialSession` — bootstrap() reads `auth.currentSession`
                // directly (local only, never the network), so this only affects the
                // advisory.
                auth: SupabaseClientOptions.AuthOptions(
                    emitLocalSessionAsInitialSession: true
                ),
                global: SupabaseClientOptions.GlobalOptions(
                    session: SupabaseManager.makeSession()
                )
            )
        )
    }

    /// The signed-in user's id, lower-cased to match the row shape pulled from
    /// Postgres. Falls back to the locally stored identity: the SDK drops its
    /// session when the server says it is gone, and that must not stop the user
    /// from creating trails offline. nil only before the first sign-in.
    var currentUserId: String? {
        client.auth.currentSession?.user.id.uuidString.lowercased()
            ?? LocalIdentityStore.shared.current?.userId
    }

    /// A weak signal is worse than no signal: URLSession's 60s default leaves
    /// every sync request (and anything awaiting it) hanging for minutes on one
    /// bar of reception. Fail fast instead — the sync engine retries with backoff.
    private static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15   // idle timeout between packets
        config.timeoutIntervalForResource = 60  // whole transfer (large GeoJSON on 2G)
        config.waitsForConnectivity = false     // offline must fail now, not queue
        return URLSession(configuration: config)
    }
}
