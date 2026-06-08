import SwiftUI

struct SettingsView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var showAccount = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        showAccount = true
                    } label: {
                        Label("Účet", systemImage: "person.circle")
                    }
                    .foregroundStyle(.primary)
                }

                Section {
                    Button(role: .destructive) {
                        Task { await auth.signOut() }
                    } label: {
                        Label("Odhlásit se", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Nastavení")
            .sheet(isPresented: $showAccount) {
                AccountView()
            }
        }
    }
}
