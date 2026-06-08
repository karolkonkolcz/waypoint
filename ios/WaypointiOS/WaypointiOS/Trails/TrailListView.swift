//
//  TrailListView.swift
//  WaypointiOS
//
//  Home: lists the signed-in user's trails. The "Done when" of Phase 0.
//

import SwiftUI

struct TrailListView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var model = TrailListViewModel()

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Moje trasy")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Odhlásit") {
                            Task { await auth.signOut() }
                        }
                    }
                }
                .task { await model.load() }
                .refreshable { await model.load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .idle, .loading:
            ProgressView("Načítám…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .loaded(let trails) where trails.isEmpty:
            ContentUnavailableView(
                "Žádné trasy",
                systemImage: "map",
                description: Text("Zatím nemáš žádnou trasu.")
            )

        case .loaded(let trails):
            List(trails) { trail in
                NavigationLink {
                    TrailDetailView(trail: trail)
                } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(trail.name)
                        .font(.headline)
                    if let description = trail.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    HStack(spacing: 12) {
                        if let startDate = trail.startDate {
                            Label(startDate.prefix(10), systemImage: "calendar")
                        }
                        Label("\(trail.defaultPaceKmh, specifier: "%.1f") km/h",
                              systemImage: "figure.walk")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
                } // NavigationLink label
            }

        case .failed(let message):
            ContentUnavailableView {
                Label("Chyba načítání", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Zkusit znovu") { Task { await model.load() } }
            }
        }
    }
}
