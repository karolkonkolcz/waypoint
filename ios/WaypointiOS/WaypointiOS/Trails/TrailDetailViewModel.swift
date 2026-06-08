import Foundation
import SwiftUI

// Reads stages for a trail from GRDB via ValueObservation.
// load(trailId:) is idempotent — the observation runs once per view lifetime.

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

    private let repo = StageRepository()
    private var observationTask: Task<Void, Never>?
    private var currentTrailId: String?

    func load(trailId: String) async {
        if currentTrailId != trailId {
            observationTask?.cancel()
            observationTask = nil
            currentTrailId = trailId
        }
        startObservationIfNeeded(trailId: trailId)
        await SyncEngine.shared.sync()
    }

    func deleteStage(_ stage: Stage) {
        do {
            try repo.remove(id: stage.id)
            Task { await SyncEngine.shared.sync() }
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func moveStages(_ stages: [Stage], from source: IndexSet, to destination: Int) {
        guard let trailId = currentTrailId else { return }
        var reordered = stages
        reordered.move(fromOffsets: source, toOffset: destination)
        do {
            try repo.reorder(trailId: trailId, orderedIds: reordered.map(\.id))
            Task { await SyncEngine.shared.sync() }
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    // MARK: - Private

    private func startObservationIfNeeded(trailId: String) {
        guard observationTask == nil else { return }
        if case .loaded = state { } else { state = .loading }

        observationTask = Task { [weak self] in
            guard let self else { return }
            for await stages in repo.observeByTrail(trailId: trailId) {
                self.state = .loaded(stages)
            }
        }
    }
}
