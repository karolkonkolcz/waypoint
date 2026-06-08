//
//  TrailListViewModel.swift
//  WaypointiOS
//
//  Phase 0 reads `trails` directly from Supabase to prove the backend recycles
//  end-to-end. From Phase 2 the UI will read GRDB instead (never Supabase) — see
//  IOS_STRATEGY.md §4 "Reads".
//

import Foundation
import Supabase

@MainActor
@Observable
final class TrailListViewModel {
    enum State {
        case idle
        case loading
        case loaded([Trail])
        case failed(String)
    }

    var state: State = .idle

    private let client = SupabaseManager.shared.client

    func load() async {
        state = .loading
        do {
            let trails: [Trail] = try await client
                .from("trails")
                .select()
                .is("deleted_at", value: nil)
                .order("created_at", ascending: false)
                .execute()
                .value
            state = .loaded(trails)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
