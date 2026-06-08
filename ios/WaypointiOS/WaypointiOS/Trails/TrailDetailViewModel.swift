//
//  TrailDetailViewModel.swift
//  WaypointiOS
//
//  Phase 1: reads stages directly from Supabase. From Phase 2, switches to GRDB.
//

import Foundation
import Supabase

@MainActor
@Observable
final class TrailDetailViewModel {
    enum State {
        case idle
        case loading
        case loaded([Stage])
        case failed(String)
    }

    var state: State = .idle

    private let client = SupabaseManager.shared.client

    func load(trailId: String) async {
        state = .loading
        do {
            let stages: [Stage] = try await client
                .from("stages")
                .select()
                .eq("trail_id", value: trailId)
                .is("deleted_at", value: nil)
                .order("order_index", ascending: true)
                .execute()
                .value
            state = .loaded(stages)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
