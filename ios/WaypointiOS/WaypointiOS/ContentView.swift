//
//  ContentView.swift
//  WaypointiOS
//
//  Root: routes between loading / login / signed-in based on auth state.
//

import SwiftUI

struct ContentView: View {
    @Environment(AuthViewModel.self) private var auth

    var body: some View {
        switch auth.step {
        case .loading:
            ProgressView()
                .task { await auth.bootstrap() }
        case .enterEmail, .enterCode:
            LoginView()
        case .signedIn:
            AppShellView()
        }
    }
}

#Preview {
    ContentView()
        .environment(AuthViewModel())
}
