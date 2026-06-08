import Supabase
import SwiftUI

struct AccountView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email: String = ""
    @State private var displayName: String = ""
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var saveStatus: SaveStatus = .idle

    enum SaveStatus { case idle, saved, failed(String) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Přihlašovací údaje") {
                    LabeledContent("E-mail") {
                        Text(email.isEmpty ? "—" : email)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Profil") {
                    TextField("Zobrazované jméno", text: $displayName)
                        .autocorrectionDisabled()
                }

                switch saveStatus {
                case .idle: EmptyView()
                case .saved:
                    Section {
                        Label("Uloženo", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                case .failed(let msg):
                    Section {
                        Label(msg, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Účet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zavřít") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Uložit") { Task { await save() } }
                    }
                }
            }
            .task { await loadProfile() }
            .redacted(reason: isLoading ? .placeholder : [])
        }
    }

    private func loadProfile() async {
        let user = SupabaseManager.shared.client.auth.currentSession?.user
        email = user?.email ?? ""

        guard let userId = SupabaseManager.shared.currentUserId else {
            isLoading = false
            return
        }

        do {
            struct ProfileRow: Decodable {
                var display_name: String?
            }
            let rows: [ProfileRow] = try await SupabaseManager.shared.client
                .from("profiles")
                .select("display_name")
                .eq("id", value: userId)
                .execute()
                .value
            displayName = rows.first?.display_name ?? ""
        } catch {
            // Ignore — just leave display name empty
        }
        isLoading = false
    }

    private func save() async {
        guard let userId = SupabaseManager.shared.currentUserId else { return }
        isSaving = true
        saveStatus = .idle
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await SupabaseManager.shared.client
                .from("profiles")
                .update(["display_name": trimmed.isEmpty ? nil : trimmed])
                .eq("id", value: userId)
                .execute()
            saveStatus = .saved
        } catch {
            saveStatus = .failed("Nepodařilo se uložit: \(error.localizedDescription)")
        }
        isSaving = false
    }
}
