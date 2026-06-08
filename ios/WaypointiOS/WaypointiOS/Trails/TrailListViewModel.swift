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

    // Called by .task { } and .refreshable { } in the view.
    // First call starts the live observation; subsequent calls also sync queued
    // local writes and pull fresh Supabase data.
    func load() async {
        startObservationIfNeeded()
        await SyncEngine.shared.sync()
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
