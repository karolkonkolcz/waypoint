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
            supabaseKey: SupabaseConfig.publishableKey
        )
    }

    /// The signed-in user's id, lower-cased to match the row shape pulled from
    /// Postgres. nil only if no session is active (should not happen past login).
    var currentUserId: String? {
        client.auth.currentSession?.user.id.uuidString.lowercased()
    }
}
