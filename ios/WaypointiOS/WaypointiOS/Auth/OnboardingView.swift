import Supabase
import SwiftUI

/// Shown once after first sign-in if the profile has no display name yet.
struct OnboardingView: View {
    var onComplete: () -> Void

    @State private var displayName: String = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var trimmed: String {
        displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 8) {
                Text("Vítej ve Waypointu")
                    .font(.largeTitle.bold())
                Text("Jak ti máme říkat?")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)

            VStack(spacing: 12) {
                TextField("Tvoje jméno", text: $displayName)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.continue)
                    .onSubmit { if !trimmed.isEmpty { Task { await save() } } }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Pokračovat")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(trimmed.isEmpty || isSaving)
            }
            .padding(.horizontal)

            Button("Přeskočit prozatím") { onComplete() }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .disabled(isSaving)

            Spacer()
        }
        .padding()
    }

    private func save() async {
        guard let userId = SupabaseManager.shared.currentUserId else {
            onComplete()
            return
        }
        isSaving = true
        errorMessage = nil
        do {
            try await SupabaseManager.shared.client
                .from("profiles")
                .update(["display_name": trimmed])
                .eq("id", value: userId)
                .execute()
            onComplete()
        } catch {
            errorMessage = error.localizedDescription
            isSaving = false
        }
    }
}
