import Foundation
import WatchConnectivity

@MainActor
final class WatchSessionBridge: NSObject {
    static let shared = WatchSessionBridge()

    private let snapshotKey = "todaySnapshot"
    private var pendingSnapshot: WatchTodaySnapshot?

    private override init() {
        super.init()
    }

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func send(snapshot: WatchTodaySnapshot) {
        guard WCSession.isSupported() else { return }
        pendingSnapshot = snapshot
        sendPendingSnapshotIfPossible()
    }

    private func sendPendingSnapshotIfPossible() {
        guard
            let snapshot = pendingSnapshot,
            WCSession.default.activationState == .activated,
            WCSession.default.isWatchAppInstalled,
            let data = try? JSONEncoder.watchSnapshot.encode(snapshot)
        else { return }

        do {
            try WCSession.default.updateApplicationContext([snapshotKey: data])
            WCSession.default.transferUserInfo([snapshotKey: data])
            pendingSnapshot = nil
        } catch {
            WCSession.default.transferUserInfo([snapshotKey: data])
        }
    }
}

extension WatchSessionBridge: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        Task { @MainActor in
            self.sendPendingSnapshotIfPossible()
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
}

extension JSONEncoder {
    static var watchSnapshot: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}
