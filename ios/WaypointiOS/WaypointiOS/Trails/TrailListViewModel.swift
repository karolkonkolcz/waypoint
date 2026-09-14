import Foundation

// Reads trails from GRDB via ValueObservation — never from Supabase directly.
// The UI always sees data from the local cache; SyncEngine keeps that cache fresh.
// See IOS_STRATEGY.md §I9 and §4 "Reads".

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

    private let repo = TrailRepository()
    private var observationTask: Task<Void, Never>?

    // Called by .task { } in the view. The observation renders the local cache
    // immediately; the sync that follows is best-effort and may be skipped
    // entirely when offline or inside a backoff window.
    func load() async {
        startObservationIfNeeded()
        await SyncEngine.shared.sync()
    }

    /// Pull-to-refresh: bypasses the sync engine's backoff window.
    func refresh() async {
        startObservationIfNeeded()
        await SyncEngine.shared.sync(.userInitiated)
    }

    func delete(_ trail: Trail) {
        do {
            try repo.remove(id: trail.id)
            Task { await SyncEngine.shared.sync() }
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    // MARK: - Private

    private func startObservationIfNeeded() {
        guard observationTask == nil else { return }
        if case .loaded = state { } else { state = .loading }

        observationTask = Task { [weak self] in
            guard let self else { return }
            for await trails in repo.observeAll() {
                self.state = .loaded(trails)
            }
        }
    }
}
