//
//  SignOutConfirmation.swift
//  WaypointiOS
//
//  Sign-out asks what should happen to the local cache. Plain sign-out keeps it:
//  after a trip, queued writes in `sync_queue` are often the only copy that
//  exists anywhere, and erasing them silently would be a data-loss bug.
//

import SwiftUI

extension View {
    func signOutConfirmation(isPresented: Binding<Bool>) -> some View {
        modifier(SignOutConfirmation(isPresented: isPresented))
    }
}

private struct SignOutConfirmation: ViewModifier {
    @Environment(AuthViewModel.self) private var auth
    @Binding var isPresented: Bool

    @State private var pendingCount = 0
    @State private var confirmingErase = false

    func body(content: Content) -> some View {
        content
            .confirmationDialog("Odhlásit se", isPresented: $isPresented, titleVisibility: .visible) {
                Button("Odhlásit se") {
                    Task { await auth.signOut(.keepData) }
                }
                Button("Odhlásit a smazat data", role: .destructive) {
                    confirmingErase = true
                }
                Button("Zrušit", role: .cancel) {}
            } message: {
                Text(keepDataMessage)
            }
            .confirmationDialog("Smazat data z telefonu?", isPresented: $confirmingErase, titleVisibility: .visible) {
                Button("Smazat a odhlásit", role: .destructive) {
                    Task { await auth.signOut(.eraseData) }
                }
                Button("Zrušit", role: .cancel) {}
            } message: {
                Text(eraseMessage)
            }
            .onChange(of: isPresented) { _, shown in
                guard shown else { return }
                pendingCount = (try? AppDatabase.shared.pendingSyncOpCount()) ?? 0
            }
    }

    private var keepDataMessage: String {
        guard pendingCount > 0 else {
            return "Trasy zůstanou v telefonu a po přihlášení stejným účtem budou hned k dispozici."
        }
        return "Máš \(czechChanges(pendingCount)), které se ještě nestihly odeslat. Odhlášení je nechá v telefonu a odešle po přihlášení stejným účtem."
    }

    private var eraseMessage: String {
        guard pendingCount > 0 else {
            return "Trasy se znovu stáhnou při dalším přihlášení."
        }
        return "Nenávratně přijdeš o \(czechChanges(pendingCount)), které ještě nejsou na serveru."
    }
}

/// "1 změnu" / "3 změny" / "7 změn" — the accusative forms the messages above need.
private func czechChanges(_ count: Int) -> String {
    switch count {
    case 1: return "1 změnu"
    case 2...4: return "\(count) změny"
    default: return "\(count) změn"
    }
}
