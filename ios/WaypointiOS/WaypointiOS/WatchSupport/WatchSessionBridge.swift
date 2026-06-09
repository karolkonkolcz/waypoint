import Foundation
import WatchConnectivity

@MainActor
final class WatchSessionBridge: NSObject {
    static let shared = WatchSessionBridge()

    private let snapshotKey = "todaySnapshot"
    private let overviewKey = "trailOverview"

    /// Latest merged application context (both payloads live here so a second
    /// `updateApplicationContext` call never clobbers the first).
    private var latestContext: [String: Any] = [:]
    /// The most recent single payload, re-sent via `transferUserInfo` for reliability.
    private var pendingUserInfo: [String: Any]?

    private override init() {
        super.init()
    }

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func send(snapshot: WatchTodaySnapshot) {
        guard let data = try? JSONEncoder.watchSnapshot.encode(snapshot) else { return }
        stage(key: snapshotKey, data: data)
    }

    func send(overview: WatchTrailOverview) {
        guard let data = try? JSONEncoder.watchSnapshot.encode(overview) else { return }
        stage(key: overviewKey, data: data)
    }

    private func stage(key: String, data: Data) {
        guard WCSession.isSupported() else { return }
        latestContext[key] = data
        pendingUserInfo = [key: data]
        flush()
    }

    private func flush() {
        guard
            WCSession.default.activationState == .activated,
            WCSession.default.isWatchAppInstalled,
            !latestContext.isEmpty
        else { return }

        try? WCSession.default.updateApplicationContext(latestContext)
        if let info = pendingUserInfo {
            WCSession.default.transferUserInfo(info)
            pendingUserInfo = nil
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
            self.flush()
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
