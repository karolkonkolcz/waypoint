import Combine
import Foundation
import WatchConnectivity

final class WatchSnapshotStore: NSObject, ObservableObject {
    @Published private(set) var snapshot: WatchTodaySnapshot?
    @Published private(set) var overview: WatchTrailOverview?

    private let snapshotKey = "todaySnapshot"
    private let overviewKey = "trailOverview"
    private let snapshotDefaultsKey = "WaypointWatchTodaySnapshot"
    private let overviewDefaultsKey = "WaypointWatchTrailOverview"

    override init() {
        super.init()
        snapshot = Self.loadCached(defaultsKey: snapshotDefaultsKey)
        overview = Self.loadCached(defaultsKey: overviewDefaultsKey)
    }

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func receive(_ context: [String: Any]) {
        if let data = context[snapshotKey] as? Data,
           let value = try? JSONDecoder.watchSnapshot.decode(WatchTodaySnapshot.self, from: data) {
            DispatchQueue.main.async {
                self.snapshot = value
                UserDefaults.standard.set(data, forKey: self.snapshotDefaultsKey)
            }
        }
        if let data = context[overviewKey] as? Data,
           let value = try? JSONDecoder.watchSnapshot.decode(WatchTrailOverview.self, from: data) {
            DispatchQueue.main.async {
                self.overview = value
                UserDefaults.standard.set(data, forKey: self.overviewDefaultsKey)
            }
        }
    }

    private static func loadCached<T: Decodable>(defaultsKey: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey) else { return nil }
        return try? JSONDecoder.watchSnapshot.decode(T.self, from: data)
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
