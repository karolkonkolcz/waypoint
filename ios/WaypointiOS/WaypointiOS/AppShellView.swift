import SwiftUI

struct AppShellView: View {
    var body: some View {
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
}
