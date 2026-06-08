import SwiftUI

@main
struct WaypointiOSApp: App {
    @State private var auth = AuthViewModel()

    init() {
        // Warm up the database (runs migrations if needed) and kick off the
        // first sync pull — both happen before the first frame renders.
        _ = AppDatabase.shared
        SyncEngine.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(auth)
        }
    }
}
