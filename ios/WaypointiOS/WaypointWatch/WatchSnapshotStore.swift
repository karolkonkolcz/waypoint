import Combine
import Foundation
import WatchConnectivity

final class WatchSnapshotStore: NSObject, ObservableObject {
    @Published private(set) var snapshot: WatchTodaySnapshot?

    private let snapshotKey = "todaySnapshot"
    private let defaultsKey = "WaypointWatchTodaySnapshot"

    override init() {
        snapshot = Self.loadCachedSnapshot(defaultsKey: defaultsKey)
        super.init()
    }

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func receive(_ context: [String: Any]) {
        guard
            let data = context[snapshotKey] as? Data,
            let snapshot = try? JSONDecoder.watchSnapshot.decode(WatchTodaySnapshot.self, from: data)
        else { return }

        DispatchQueue.main.async {
            self.snapshot = snapshot
            UserDefaults.standard.set(data, forKey: self.defaultsKey)
        }
    }

    private static func loadCachedSnapshot(defaultsKey: String) -> WatchTodaySnapshot? {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey) else { return nil }
        return try? JSONDecoder.watchSnapshot.decode(WatchTodaySnapshot.self, from: data)
    }
}

extension WatchSnapshotStore: WCSessionDelegate {
    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        receive(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        receive(applicationContext)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        receive(userInfo)
    }
}

extension JSONDecoder {
    static var watchSnapshot: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
