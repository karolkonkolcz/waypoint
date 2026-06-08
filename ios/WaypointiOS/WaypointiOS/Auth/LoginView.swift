//
//  LoginView.swift
//  WaypointiOS
//
//  Two-step email-OTP UI: enter e-mail → enter the 6-digit code.
//

import SwiftUI

struct LoginView: View {
    @Environment(AuthViewModel.self) private var auth

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

            switch auth.step {
            case .enterCode(let email):
                codeStep(email: email)
            default:
                emailStep
            }

            if let message = auth.errorMessage {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
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
            Text("Přihlas se e-mailem. Pošleme ti ověřovací kód.")
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
