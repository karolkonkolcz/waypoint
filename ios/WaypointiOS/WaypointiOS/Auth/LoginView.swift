//
//  LoginView.swift
//  WaypointiOS
//
//  Two-step email-OTP UI: enter e-mail → enter the 6-digit code.
//
//  Two modes. `.initial` is the full-screen sign-in for a device with no local
//  identity. `.reauth` is the same flow in a sheet, for a device that already
//  holds its data but whose session the server has dropped — there it is
//  dismissible, because nothing about the app is blocked on it.
//

import SwiftUI

struct LoginView: View {
    enum Mode {
        case initial
        case reauth
    }

    @Environment(AuthViewModel.self) private var auth

    var mode: Mode = .initial

    @State private var email = ""
    @State private var code = ""

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 8) {
                Image(systemName: "mountain.2.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(.tint)
                Text("Waypoint")
                    .font(.largeTitle.bold())
            }

            switch auth.flow {
            case .enterCode(let email):
                codeStep(email: email)
            case .enterEmail:
                emailStep
            }

            if let message = auth.errorMessage {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            if mode == .reauth {
                Button("Později") { auth.dismissReauth() }
                    .font(.subheadline)
            }

            Spacer()
        }
        .padding(.horizontal, 32)
        .disabled(auth.isWorking)
        .overlay {
            if auth.isWorking { ProgressView() }
        }
    }

    private var emailStep: some View {
        VStack(spacing: 16) {
            Text(mode == .reauth
                 ? "Tvoje data jsou v telefonu v pořádku. Přihlas se znovu, aby se mohla synchronizovat."
                 : "Přihlas se e-mailem. Pošleme ti ověřovací kód.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            TextField("tvuj@email.cz", text: $email)
                .textFieldStyle(.roundedBorder)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            Button("Poslat kód") {
                Task { await auth.sendCode(to: email) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.isEmpty)
        }
        .onAppear {
            if email.isEmpty, let known = LocalIdentityStore.shared.current?.email {
                email = known
            }
        }
    }

    private func codeStep(email: String) -> some View {
        VStack(spacing: 16) {
            Text("Zadej kód, který jsme poslali na \(email).")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            TextField("123456", text: $code)
                .textFieldStyle(.roundedBorder)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.title2.monospacedDigit())

            Button("Ověřit") {
                Task { await auth.verify(email: email, code: code) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(code.count < 6)
        }
    }
}
