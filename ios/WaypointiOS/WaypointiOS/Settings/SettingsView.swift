import SwiftUI

struct SettingsView: View {
    @State private var showAccount = false
    @State private var showSignOut = false

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
                        showSignOut = true
                    } label: {
                        Label("Odhlásit se", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Nastavení")
            .sheet(isPresented: $showAccount) {
                AccountView()
            }
            .signOutConfirmation(isPresented: $showSignOut)
        }
    }
}
