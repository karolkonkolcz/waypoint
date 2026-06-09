import SwiftUI

@main
struct WaypointWatchApp: App {
    @StateObject private var store = WatchSnapshotStore()

    var body: some Scene {
        WindowGroup {
            WatchTodayView(snapshot: store.snapshot)
                .task { store.start() }
        }
    }
}
