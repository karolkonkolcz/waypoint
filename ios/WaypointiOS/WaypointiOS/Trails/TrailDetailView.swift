//
//  TrailDetailView.swift
//  WaypointiOS
//
//  Trail overview + stage list. Difficulty + ETA computed live via domain engines.
//

import SwiftUI

struct TrailDetailView: View {
    let trail: Trail
    @State private var model = TrailDetailViewModel()
    @State private var showEditTrail = false
    @State private var addingStage = false
    @State private var editingStage: Stage?
    @State private var addingWaypoint = false
    @State private var editingWaypoint: Waypoint?
    @State private var waypoints: [Waypoint] = []

    private let waypointRepo = WaypointRepository()

    private var stages: [Stage] {
        if case .loaded(let stages) = model.state { return stages }
        return []
    }

    var body: some View {
        content
            .navigationTitle(trail.name)
            .navigationBarTitleDisplayMode(.large)
            .toolbar { toolbar }
            .task { await model.load(trailId: trail.id) }
            .task { await streamWaypoints() }
            .refreshable { await model.load(trailId: trail.id) }
            .sheet(isPresented: $showEditTrail) {
                TrailEditView(trail: trail)
            }
            .sheet(isPresented: $addingStage) {
                StageEditView(trailId: trail.id, nextOrderIndex: stages.count)
            }
            .sheet(item: $editingStage) { stage in
                StageEditView(trailId: trail.id, stage: stage)
            }
            .sheet(isPresented: $addingWaypoint) {
                WaypointEditView(trailId: trail.id)
            }
            .sheet(item: $editingWaypoint) { wp in
                WaypointEditView(trailId: trail.id, waypoint: wp)
            }
    }

    private func streamWaypoints() async {
        for await items in waypointRepo.observeByTrail(trailId: trail.id) {
            waypoints = items
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            EditButton()
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { addingStage = true } label: {
                    Label("Přidat etapu", systemImage: "plus")
                }
                Button { showEditTrail = true } label: {
                    Label("Upravit trasu", systemImage: "pencil")
                }
                NavigationLink {
                    TrailMapView(trail: trail, stages: stages)
                } label: {
                    Label("Mapa", systemImage: "map")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .accessibilityLabel("Akce")
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .idle, .loading:
            ProgressView("Načítám etapy…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .loaded(let stages):
            List {
                // Cover photo
                if let url = trail.coverImageUrl.flatMap(URL.init(string:)) {
                    Section {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFill()
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 200)
                                    .clipped()
                            case .failure:
                                EmptyView()
                            default:
                                Color.secondary.opacity(0.15)
                                    .frame(height: 200)
                            }
                        }
                        .listRowInsets(EdgeInsets())
                    }
                }

                if let desc = trail.description, !desc.isEmpty {
                    Section {
                        Text(desc)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Etapy (\(stages.count))") {
                    if stages.isEmpty {
                        Text("Tato trasa zatím nemá etapy. Přidej etapu nebo importuj GPX.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(stages) { stage in
                        NavigationLink {
                            StageDetailView(stage: stage, trail: trail)
                        } label: {
                            StageRow(stage: stage, trail: trail)
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                model.deleteStage(stage)
                            } label: {
                                Label("Smazat", systemImage: "trash")
                            }
                            Button {
                                editingStage = stage
                            } label: {
                                Label("Upravit", systemImage: "pencil")
                            }
                            .tint(.blue)
                        }
                    }
                    .onMove { source, destination in
                        model.moveStages(stages, from: source, to: destination)
                    }
                }

                // Waypoints
                Section {
                    if waypoints.isEmpty {
                        Text("Žádné body zájmu")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(waypoints) { wp in
                        WaypointRow(waypoint: wp)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    deleteWaypoint(wp)
                                } label: {
                                    Label("Smazat", systemImage: "trash")
                                }
                                Button {
                                    editingWaypoint = wp
                                } label: {
                                    Label("Upravit", systemImage: "pencil")
                                }
                                .tint(.blue)
                            }
                    }
                    Button {
                        addingWaypoint = true
                    } label: {
                        Label("Přidat bod", systemImage: "plus")
                    }
                } header: {
                    Text("Body zájmu (\(waypoints.count))")
                }
            }

        case .failed(let message):
            ContentUnavailableView {
                Label("Chyba načítání", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Zkusit znovu") { Task { await model.load(trailId: trail.id) } }
            }
        }
    }
}

// MARK: - Waypoint delete helper (must live in the View scope)

extension TrailDetailView {
    func deleteWaypoint(_ wp: Waypoint) {
        try? waypointRepo.remove(id: wp.id)
        Task { await SyncEngine.shared.sync() }
    }
}

// MARK: - Stage row

private struct StageRow: View {
    let stage: Stage
    let trail: Trail

    private var difficulty: DifficultyResult {
        stage.computedDifficulty(paceKmh: trail.defaultPaceKmh)
    }

    private var etaHours: Double {
        naismithHours(distanceKm: stage.distanceKm, ascentM: stage.ascentM, paceKmh: trail.defaultPaceKmh)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(stage.title)
                    .font(.headline)
                Spacer()
                DifficultyBadge(result: difficulty)
            }

            HStack(spacing: 12) {
                if let dateStr = stageDate(date: stage.date, orderIndex: stage.orderIndex, trailStartDate: trail.startDate) {
                    Label(formatStageDate(dateStr), systemImage: "calendar")
                }
                Label(String(format: "%.1f km", stage.distanceKm), systemImage: "arrow.triangle.swap")
                Label(etaLabel, systemImage: "clock")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if stage.ascentM > 0 || stage.descentM > 0 {
                HStack(spacing: 12) {
                    Label(String(format: "+%.0f m", stage.ascentM), systemImage: "arrow.up.right")
                    Label(String(format: "−%.0f m", stage.descentM), systemImage: "arrow.down.right")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var etaLabel: String {
        let h = Int(etaHours)
        let m = Int((etaHours - Double(h)) * 60)
        if h == 0 { return "\(m) min" }
        if m == 0 { return "\(h) h" }
        return "\(h) h \(m) min"
    }
}

// MARK: - Waypoint row

private struct WaypointRow: View {
    let waypoint: Waypoint

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: iconForType(waypoint.type))
                .foregroundStyle(.secondary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(waypoint.name)
                    .font(.subheadline)
                HStack(spacing: 8) {
                    if let dist = waypoint.distanceAlongRouteKm {
                        Text(String(format: "%.1f km", dist))
                    }
                    if let ele = waypoint.elevationM {
                        Text("\(ele) m n. m.")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func iconForType(_ type: String) -> String {
        switch type {
        case "camp": return "tent.fill"
        case "water": return "drop.fill"
        case "hut": return "house.fill"
        case "viewpoint": return "eye.fill"
        case "road": return "road.lanes"
        default: return "mappin.circle.fill"
        }
    }
}
