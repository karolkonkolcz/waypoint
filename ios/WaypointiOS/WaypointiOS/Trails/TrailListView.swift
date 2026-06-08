//
//  TrailListView.swift
//  WaypointiOS
//
//  Home: lists the signed-in user's trails. The "Done when" of Phase 0.
//

import SwiftUI
import GRDB

struct TrailListView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var model = TrailListViewModel()
    @State private var showNewTrail = false
    @State private var showGpxImport = false
    @State private var importedTrailId: String?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Moje trasy")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Odhlásit") {
                            Task { await auth.signOut() }
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button { showNewTrail = true } label: {
                                Label("Nová trasa", systemImage: "plus")
                            }
                            Button { showGpxImport = true } label: {
                                Label("Import GPX", systemImage: "square.and.arrow.down")
                            }
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Přidat")
                    }
                }
                .task { await model.load() }
                .refreshable { await model.load() }
                .sheet(isPresented: $showNewTrail) {
                    TrailEditView()
                }
                .sheet(isPresented: $showGpxImport) {
                    GpxImportView { trailId in importedTrailId = trailId }
                }
                .navigationDestination(item: $importedTrailId) { trailId in
                    DeferredTrailDetailView(trailId: trailId)
                }
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
            List {
                ForEach(trails) { trail in
                    NavigationLink {
                        TrailDetailView(trail: trail)
                    } label: {
                        TrailRow(trail: trail)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            model.delete(trail)
                        } label: {
                            Label("Smazat", systemImage: "trash")
                        }
                    }
                }
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

// MARK: - Row

private struct TrailRow: View {
    let trail: Trail

    var body: some View {
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
    }
}

// MARK: - Deferred detail (open a trail by id, e.g. right after GPX import)

private struct DeferredTrailDetailView: View {
    let trailId: String
    @State private var trail: Trail?

    var body: some View {
        Group {
            if let trail {
                TrailDetailView(trail: trail)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task {
            trail = try? AppDatabase.shared.dbPool.read { db in
                try Trail.fetchOne(db, key: trailId)
            }
        }
    }
}
