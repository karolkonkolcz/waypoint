import SwiftUI

struct TodayView: View {
    @State private var model = TodayViewModel()

    var body: some View {
        NavigationStack {
            content
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        WaypointLockup(size: 20)
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
            ProgressView("Načítám dnešek…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .empty(let greeting):
            ContentUnavailableView {
                Text(greeting)
                    .font(.title2.bold())
            } description: {
                Text("Zatím nemáš žádnou trasu.")
            }

        case .noStage(let greeting, let trail):
            VStack(spacing: 16) {
                Text(greeting)
                    .font(.title2.bold())
                    .frame(maxWidth: .infinity, alignment: .leading)
                ContentUnavailableView(
                    "Na dnešek není naplánovaná žádná etapa",
                    systemImage: "calendar",
                    description: Text("Na trase \(trail.name) dnes nic naplánovaného není.")
                )
            }
            .padding()

        case .loaded(let dashboard):
            TodayDashboardView(
                dashboard: dashboard,
                alerts: model.alerts,
                alertsLoading: model.alertsLoading,
                updatingStartHour: model.updatingStartHour,
                newTodoText: $model.newTodoText,
                addTodo: model.addTodo,
                toggleTodo: model.toggleTodo,
                removeTodo: model.removeTodo,
                changeStartHour: model.changeStartHour
            )

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

private struct TodayDashboardView: View {
    let dashboard: TodayDashboard
    let alerts: CachedAlerts?
    let alertsLoading: Bool
    let updatingStartHour: Bool
    @Binding var newTodoText: String
    let addTodo: () -> Void
    let toggleTodo: (Todo) -> Void
    let removeTodo: (Todo) -> Void
    let changeStartHour: (Int) -> Void

    /// Distance scrubbed on the elevation profile (km), nil when not touching.
    @State private var scrubKm: Double?
    /// Live GPS, snapped onto today's route for the "you are here" marker.
    @State private var location = CurrentLocationProvider()

    /// Off-route threshold (km). Beyond this we hide the marker rather than
    /// snapping the hiker to a point on a trail they aren't actually walking.
    private static let onRouteThresholdKm = 0.25

    private var currentProjection: RouteProjection? {
        guard let coord = location.coordinate, let line = dashboard.route?.line,
              let proj = nearestPointOnRoute(line, to: coord),
              proj.offRouteKm <= Self.onRouteThresholdKm
        else { return nil }
        return proj
    }

    private var highlightCoord: Coord2? {
        if let km = scrubKm, let line = dashboard.route?.line {
            return pointAtDistance(line, km)
        }
        return currentProjection?.point
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(dashboard.greeting)
                    .font(.title2.bold())

                WeatherAlertBadge(
                    alerts: alerts?.alerts ?? [],
                    stale: alerts.map { !AlertsRepositoryFresh($0) } ?? false,
                    loading: alertsLoading,
                    offline: alerts == nil && alertsLoading == false,
                    checkedAt: alerts?.fetchedAt
                )

                headerCard

                hero

                if !dashboard.isTransit, dashboard.elevationProfile.count >= 2 {
                    ElevationProfileChart(
                        profile: dashboard.elevationProfile,
                        rainOnset: dashboard.timeline?.rainOnset,
                        scrubKm: $scrubKm,
                        currentKm: currentProjection?.km
                    )
                    .padding()
                    .background(.background, in: RoundedRectangle(cornerRadius: 16))
                    .overlay { RoundedRectangle(cornerRadius: 16).stroke(.quaternary) }
                }

                if !dashboard.isTransit {
                    stats
                }

                if dashboard.weather != nil {
                    NavigationLink {
                        StageDetailView(stage: dashboard.stage, trail: dashboard.trail)
                    } label: {
                        weather
                    }
                    .buttonStyle(.plain)
                } else {
                    weather
                }

                if let snapshot = dashboard.weather,
                   let start = snapshot.startHour,
                   let arrival = snapshot.arrivalHour,
                   snapshot.moving != nil {
                    MovingWeatherBanner(startHour: start, arrivalHour: arrival)
                        .padding()
                        .background(.background, in: RoundedRectangle(cornerRadius: 16))
                        .overlay { RoundedRectangle(cornerRadius: 16).stroke(.quaternary) }
                }

                if let timeline = dashboard.timeline, !timeline.rows.isEmpty {
                    RouteTimelineView(
                        timeline: timeline,
                        startHour: dashboard.startHour,
                        hasForecast: dashboard.weather != nil,
                        updating: updatingStartHour,
                        onStartHourChange: changeStartHour
                    )
                }

                TodoPanel(
                    todos: dashboard.todos,
                    newTodoText: $newTodoText,
                    addTodo: addTodo,
                    toggleTodo: toggleTodo,
                    removeTodo: removeTodo
                )
            }
            .padding()
        }
        .onAppear { location.start() }
        .onDisappear { location.stop() }
    }

    // MARK: - Compact premium header

    /// One card consolidating what the PWA spread across several blocks:
    /// date · day, title, difficulty, direction and the day briefing.
    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(dayLine)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer()
                if !dashboard.isTransit {
                    DifficultyBadge(result: dashboard.difficulty)
                } else {
                    Label("Přesunový den", systemImage: "arrow.left.arrow.right")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }

            Text(dashboard.displayTitle)
                .font(.title3.bold())
                .fixedSize(horizontal: false, vertical: true)

            if let direction = dashboard.direction, direction.label != dashboard.displayTitle {
                Label(direction.label, systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Text(emphasizedSummary)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).stroke(.quaternary) }
    }

    private var dayLine: String {
        let day = dashboard.isTransit ? nil : "Den \(dashboard.dayNumber)"
        return [day, dashboard.dateLabel].compactMap { $0 }.joined(separator: " · ")
    }

    /// Bold the difficulty word and any HH:MM in the briefing so it scans fast.
    private var emphasizedSummary: AttributedString {
        var attributed = AttributedString(dashboard.summary)
        let emphasis = ["snadný", "středně náročný", "těžký", "extrémní"]
        for word in emphasis {
            if let range = attributed.range(of: word) {
                attributed[range].font = .footnote.weight(.semibold)
                attributed[range].foregroundColor = .primary
            }
        }
        return attributed
    }

    @ViewBuilder
    private var hero: some View {
        if let route = dashboard.route {
            NavigationLink {
                RouteMapScreen(title: dashboard.displayTitle, routes: [route])
            } label: {
                RouteMapView(
                    routes: [route],
                    interactiveHint: true,
                    showsCurrentLocation: true,
                    highlight: highlightCoord
                )
                .frame(height: 184)
            }
            .buttonStyle(.plain)
        } else if !dashboard.isTransit {
            RoundedRectangle(cornerRadius: 16)
                .fill(.quaternary)
                .frame(height: 120)
                .overlay {
                    Label("Trasa není uložená", systemImage: "map")
                        .foregroundStyle(.secondary)
                }
        }
    }

    private var stats: some View {
        HStack(spacing: 8) {
            StatTile(value: String(format: "%.1f km", dashboard.stage.distanceKm), label: "Vzdálenost")
            StatTile(value: String(format: "+%.0f m", dashboard.stage.ascentM), label: "Stoupání")
            StatTile(value: formattedETA, label: "ETA")
        }
    }

    @ViewBuilder
    private var weather: some View {
        if let snapshot = dashboard.weather {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Počasí")
                        .font(.headline)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                HStack {
                    if let midday = snapshot.entries.first(where: { $0.hour == 12 }) ?? snapshot.entries.first {
                        Text("\(weatherConditionLabel(midday.condition)), \(midday.tempC) °C")
                    }
                    Spacer()
                    Text("Srážky \(String(format: "%.1f mm", snapshot.precipTotalMm))")
                        .foregroundStyle(.secondary)
                }
                if let hour = snapshot.rainStartsHour {
                    Label("Déšť kolem \(String(format: "%02d:00", hour))", systemImage: "cloud.rain")
                        .foregroundStyle(.blue)
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background, in: RoundedRectangle(cornerRadius: 16))
            .overlay { RoundedRectangle(cornerRadius: 16).stroke(.quaternary) }
        }
    }

    private var etaHours: Double {
        naismithHours(
            distanceKm: dashboard.stage.distanceKm,
            ascentM: dashboard.stage.ascentM,
            paceKmh: dashboard.trail.defaultPaceKmh
        )
    }

    private var formattedETA: String {
        let h = Int(etaHours)
        let m = Int((etaHours - Double(h)) * 60)
        if h == 0 { return "\(m) min" }
        if m == 0 { return "\(h) h" }
        return "\(h) h \(m) min"
    }
}

/// Standalone freshness check so the view doesn't reach into the actor.
private func AlertsRepositoryFresh(_ cached: CachedAlerts) -> Bool {
    Date().timeIntervalSince(cached.fetchedAt) < 30 * 60
}

private struct StatTile: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).stroke(.quaternary) }
    }
}

private struct TodoPanel: View {
    let todos: [Todo]
    @Binding var newTodoText: String
    let addTodo: () -> Void
    let toggleTodo: (Todo) -> Void
    let removeTodo: (Todo) -> Void

    private var doneCount: Int { todos.filter(\.done).count }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Dnešní seznam")
                    .font(.headline)
                Spacer()
                if !todos.isEmpty {
                    Text("\(doneCount)/\(todos.count)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }

            ForEach(todos) { todo in
                HStack(spacing: 12) {
                    Button {
                        toggleTodo(todo)
                    } label: {
                        Image(systemName: todo.done ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                    }
                    .buttonStyle(.plain)

                    Text(todo.text)
                        .strikethrough(todo.done)
                        .foregroundStyle(todo.done ? .secondary : .primary)
                    Spacer()
                    Button(role: .destructive) {
                        removeTodo(todo)
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.plain)
                }
                .frame(minHeight: 44)
            }

            HStack {
                TextField("Přidat připomínku…", text: $newTodoText)
                    .textFieldStyle(.roundedBorder)
                Button {
                    addTodo()
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.title2)
                }
                .disabled(newTodoText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).stroke(.quaternary) }
    }
}
