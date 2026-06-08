//
//  ContentView.swift
//  WaypointiOS
//
//  Root: routes between loading / login / onboarding / signed-in.
//

import Supabase
import SwiftUI

struct ContentView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var needsOnboarding: Bool = false
    @State private var onboardingChecked: Bool = false

    var body: some View {
        switch auth.step {
        case .loading:
            ProgressView()
                .task { await auth.bootstrap() }

        case .enterEmail, .enterCode:
            LoginView()
                .onChange(of: auth.step) { _, newStep in
                    if case .signedIn = newStep {
                        onboardingChecked = false
                    }
                }

        case .signedIn:
            AppShellView()
                .task {
                    guard !onboardingChecked else { return }
                    onboardingChecked = true
                    needsOnboarding = await shouldShowOnboarding()
                }
                .sheet(isPresented: $needsOnboarding) {
                    OnboardingView { needsOnboarding = false }
                        .interactiveDismissDisabled(true)
                }
        }
    }

    private func shouldShowOnboarding() async -> Bool {
        guard let userId = SupabaseManager.shared.currentUserId else { return false }
        struct ProfileRow: Decodable { var display_name: String? }
        guard let rows = try? await SupabaseManager.shared.client
            .from("profiles")
            .select("display_name")
            .eq("id", value: userId)
            .execute()
            .value as [ProfileRow]
        else { return false }
        let name = rows.first?.display_name ?? ""
        return name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

#Preview {
    ContentView()
        .environment(AuthViewModel())
}
