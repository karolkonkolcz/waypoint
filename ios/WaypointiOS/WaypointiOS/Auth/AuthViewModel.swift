//
//  AuthViewModel.swift
//  WaypointiOS
//
//  Email-OTP auth (I8): online once to verify the 6-digit code, session then
//  persisted by supabase-swift's default Keychain storage. No password.
//
//  Offline contract (ARCHITECTURE.md D7): after that first verification the app
//  is usable indefinitely without a network. Nothing on the launch path may
//  touch the server — notably NOT `auth.session`, whose getter silently
//  refreshes over the network once the access token expires (default 1 hour)
//  and throws when there is no connection.
//

import Foundation
import Supabase

@MainActor
@Observable
final class AuthViewModel {
    /// Where the app is routed. Deliberately coarse: re-authentication is *not*
    /// a step here, because a device that has lost its session still shows the
    /// full app — see `needsReauth`.
    enum Step: Equatable {
        case loading    // reading the locally persisted identity
        case signedOut  // no identity on this device → full-screen login
        case signedIn
    }

    /// The two screens of the OTP flow, used both for the initial login and for
    /// re-authentication.
    enum LoginFlow: Equatable {
        case enterEmail
        case enterCode(email: String)
    }

    enum SignOutMode {
        case keepData   // data stays; the same account picks it back up
        case eraseData
    }

    /// What `bootstrap()` decides from purely local state.
    enum LaunchRoute: Equatable {
        case signedIn
        case reauth
        case signedOut
    }

    var step: Step = .loading
    var flow: LoginFlow = .enterEmail
    var errorMessage: String?
    var isWorking = false

    /// The identity is known locally but the server no longer accepts our
    /// session. The app stays fully usable — only sync pauses until the user
    /// enters a fresh code.
    var needsReauth = false
    var isPresentingReauth = false

    private let auth = SupabaseManager.shared.client.auth

    init() {
        // The sync engine is what discovers a dead session (it is the only thing
        // that talks to the server), so it tells us rather than the other way round.
        NotificationCenter.default.addObserver(
            forName: .waypointSessionLost,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.markSessionLost() }
        }
    }

    /// Restore the local session. Never touches the network.
    func bootstrap() async {
        let session = auth.currentSession
        let owner = (try? AppDatabase.shared.dataOwnerUserId()) ?? nil

        switch AuthViewModel.launchRoute(
            sessionUserId: session?.user.id.uuidString.lowercased(),
            identityUserId: LocalIdentityStore.shared.current?.userId,
            dataOwnerUserId: owner
        ) {
        case .signedIn:
            if let session {
                let userId = session.user.id.uuidString.lowercased()
                LocalIdentityStore.shared.adopt(userId: userId, email: session.user.email)
                // Upgrade path: installs from before this build have a cache but
                // no recorded owner.
                if owner == nil {
                    try? AppDatabase.shared.setDataOwnerUserId(userId)
                }
            }
            needsReauth = false
            step = .signedIn

        case .reauth:
            needsReauth = true
            step = .signedIn

        case .signedOut:
            // Keychain items can outlive an app deletion, so an identity with no
            // cache behind it is a fresh install, not a returning user.
            LocalIdentityStore.shared.clear()
            step = .signedOut
        }
    }

    /// Pure routing decision, from local state only. Kept separate so the
    /// offline launch contract is unit-testable without a Keychain or a server.
    static func launchRoute(
        sessionUserId: String?,
        identityUserId: String?,
        dataOwnerUserId: String?
    ) -> LaunchRoute {
        // A stored session — valid or long expired, we do not go online to find
        // out. Months in a dead zone still open straight into the data.
        if sessionUserId != nil { return .signedIn }
        // The SDK dropped its session but the cache is demonstrably ours.
        if let identityUserId, identityUserId == dataOwnerUserId { return .reauth }
        return .signedOut
    }

    // MARK: - OTP flow

    func sendCode(to email: String) async {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard email.contains("@") else {
            errorMessage = "Zadej platný e-mail."
            return
        }
        await run {
            try await auth.signInWithOTP(email: email, shouldCreateUser: true)
            flow = .enterCode(email: email)
        }
    }

    func verify(email: String, code: String) async {
        let code = code.trimmingCharacters(in: .whitespacesAndNewlines)
        await run {
            try await auth.verifyOTP(email: email, token: code, type: .email)
            guard let session = auth.currentSession else {
                throw AuthError.sessionMissing
            }
            try await adopt(session)
            flow = .enterEmail
            needsReauth = false
            isPresentingReauth = false
            step = .signedIn
        }
    }

    /// Attach the local cache to the account that just signed in. Only a
    /// *different* account wipes it — a returning user keeps everything,
    /// including writes still queued from the trail.
    private func adopt(_ session: Session) async throws {
        let userId = session.user.id.uuidString.lowercased()
        let previousOwner = try AppDatabase.shared.dataOwnerUserId()
        if let previousOwner, previousOwner != userId {
            try await AppDatabase.shared.eraseAllData()
            WatchSessionBridge.shared.clear()
        }
        try AppDatabase.shared.setDataOwnerUserId(userId)
        LocalIdentityStore.shared.save(
            LocalIdentity(userId: userId, email: session.user.email, signedInAt: Date())
        )
    }

    // MARK: - Re-authentication

    func beginReauth() {
        flow = .enterEmail
        errorMessage = nil
        isPresentingReauth = true
    }

    func dismissReauth() {
        isPresentingReauth = false
        flow = .enterEmail
        errorMessage = nil
    }

    private func markSessionLost() {
        guard step == .signedIn, LocalIdentityStore.shared.current != nil else { return }
        needsReauth = true
    }

    // MARK: - Sign out

    func signOut(_ mode: SignOutMode) async {
        await run {
            // The SDK removes its stored session before calling /logout, so a
            // failure here means only that the server was not reachable — which
            // is the normal case for someone finishing a trip.
            try? await auth.signOut()
            LocalIdentityStore.shared.clear()
            WatchSessionBridge.shared.clear()
            if mode == .eraseData {
                try await AppDatabase.shared.eraseAllData()
            }
            needsReauth = false
            isPresentingReauth = false
            flow = .enterEmail
            step = .signedOut
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
