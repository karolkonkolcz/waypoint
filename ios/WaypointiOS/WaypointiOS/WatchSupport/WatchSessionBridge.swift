import Foundation
import WatchConnectivity

@MainActor
final class WatchSessionBridge: NSObject {
    static let shared = WatchSessionBridge()

    private let snapshotKey = "todaySnapshot"
    private let overviewKey = "trailOverview"
    private let clearedKey = "cleared"

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
        // Real data supersedes any pending clear so the watch keeps the new account's payload.
        latestContext[clearedKey] = nil
        latestContext[key] = data
        pendingUserInfo = [key: data]
        flush()
    }

    /// Tell the watch to drop its cached snapshot/overview (e.g. on sign-out).
    /// Replaces the whole context so a stale payload can't linger, and uses a
    /// changing timestamp so WatchConnectivity always delivers the update.
    func clear() {
        guard WCSession.isSupported() else { return }
        let token = Date().timeIntervalSince1970
        latestContext = [clearedKey: token]
        pendingUserInfo = [clearedKey: token]
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
