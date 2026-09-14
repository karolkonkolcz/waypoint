import SwiftUI

struct AppShellView: View {
    @Environment(AuthViewModel.self) private var auth

    var body: some View {
        @Bindable var auth = auth

        VStack(spacing: 0) {
            // Losing the session is a sync problem, not an access problem: the
            // whole app stays open below this bar.
            if auth.needsReauth {
                reauthBanner
            }

            TabView {
                TodayView()
                    .tabItem {
                        Label("Dnes", systemImage: "sun.max")
                    }

                TrailListView()
                    .tabItem {
                        Label("Trasy", systemImage: "map")
                    }

                WeatherTabView()
                    .tabItem {
                        Label("Počasí", systemImage: "cloud.sun")
                    }

                SettingsView()
                    .tabItem {
                        Label("Nastavení", systemImage: "gearshape")
                    }
            }
        }
        .sheet(isPresented: $auth.isPresentingReauth) {
            LoginView(mode: .reauth)
        }
    }

    private var reauthBanner: some View {
        Button {
            auth.beginReauth()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "arrow.triangle.2.circlepath.circle")
                Text("Synchronizace pozastavena — přihlas se znovu")
                    .font(.footnote)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(.orange.opacity(0.18))
            .foregroundStyle(.primary)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Otevře přihlášení. Data v telefonu zůstávají dostupná.")
    }
}
