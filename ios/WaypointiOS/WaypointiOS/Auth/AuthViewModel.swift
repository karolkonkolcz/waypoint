//
//  AuthViewModel.swift
//  WaypointiOS
//
//  Email-OTP auth (I8): online once to verify the 6-digit code, session then
//  persisted by supabase-swift's default Keychain storage. No password.
//

import Foundation
import Supabase

@MainActor
@Observable
final class AuthViewModel {
    enum Step: Equatable {
        case loading          // restoring a persisted session
        case enterEmail
        case enterCode(email: String)
        case signedIn
    }

    var step: Step = .loading
    var errorMessage: String?
    var isWorking = false

    private let auth = SupabaseManager.shared.client.auth

    /// Restore any persisted session on launch.
    func bootstrap() async {
        do {
            _ = try await auth.session
            step = .signedIn
        } catch {
            step = .enterEmail
        }
    }

    func sendCode(to email: String) async {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard email.contains("@") else {
            errorMessage = "Zadej platný e-mail."
            return
        }
        await run {
            try await auth.signInWithOTP(email: email, shouldCreateUser: true)
            step = .enterCode(email: email)
        }
    }

    func verify(email: String, code: String) async {
        let code = code.trimmingCharacters(in: .whitespacesAndNewlines)
        await run {
            try await auth.verifyOTP(email: email, token: code, type: .email)
            step = .signedIn
        }
    }

    func signOut() async {
        await run {
            try await auth.signOut()
            // Local-first: the SQLite cache outlives the session, so wipe it (and the
            // watch's cached snapshots) or the next account would inherit these trails.
            try await AppDatabase.shared.eraseAllData()
            WatchSessionBridge.shared.clear()
            step = .enterEmail
        }
    }

    /// Run an async auth call with shared loading/error handling.
    private func run(_ work: () async throws -> Void) async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await work()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
