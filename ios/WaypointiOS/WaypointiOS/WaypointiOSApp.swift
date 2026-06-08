//
//  WaypointiOSApp.swift
//  WaypointiOS
//
//  Created by Karol Konkoľ on 08.06.2026.
//

import SwiftUI

@main
struct WaypointiOSApp: App {
    @State private var auth = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(auth)
        }
    }
}
