import SwiftUI

struct TodayView: View {
    @State private var model = TodayViewModel()

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Dnes")
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
                newTodoText: $model.newTodoText,
                addTodo: model.addTodo,
                toggleTodo: model.toggleTodo,
                removeTodo: model.removeTodo,
                updateStartHour: model.updateStartHour
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
    @Binding var newTodoText: String
    let addTodo: () -> Void
    let toggleTodo: (Todo) -> Void
    let removeTodo: (Todo) -> Void
    let updateStartHour: (Int) -> Void

    private var etaHours: Double {
        naismithHours(
            distanceKm: dashboard.stage.distanceKm,
            ascentM: dashboard.stage.ascentM,
            paceKmh: dashboard.trail.defaultPaceKmh
        )
    }

    private var direction: RouteDirection? {
        routeDirection(line: dashboard.routeLine, title: dashboard.stage.title)
    }

    private var displayTitle: String {
        stageDisplayTitle(stage: dashboard.stage, line: dashboard.routeLine)
    }

    private var timeline: (rows: [RouteTimelineRow], rain: RainOnset?, arrivalHour: Double)? {
        guard !dashboard.elevationProfile.isEmpty else { return nil }
        let direction = direction
        return buildRouteTimeline(
            profile: dashboard.elevationProfile,
            waypoints: dashboard.waypoints,
            paceKmh: dashboard.trail.defaultPaceKmh,
            startHour: Double(dashboard.startHour),
            startName: direction?.start ?? "Start",
            destinationName: direction?.destination ?? "Cíl",
            snapshot: dashboard.weather
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(dashboard.greeting)
                    .font(.title2.bold())
                WeatherAlertStatusPanel()
                summary
                stageHeader
                mapAndStats
                if let timeline {
                    RouteProfilePanel(profile: dashboard.elevationProfile, rain: timeline.rain)
                    EtaPrecipTimelinePanel(
                        rows: timeline.rows,
                        startHour: dashboard.startHour,
                        hasForecast: dashboard.weather != nil,
                        updateStartHour: updateStartHour
                    )
                }
                if let notes = dashboard.stage.notes, !notes.isEmpty {
                    notesPanel(notes)
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
    }

    @ViewBuilder
    private var mapAndStats: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let route = dashboard.route {
                RouteMapView(routes: [route], interactiveHint: true)
                    .frame(height: 176)
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(.quaternary)
                    .frame(height: 120)
                    .overlay {
                        Label("Trasa není uložená", systemImage: "map")
                            .foregroundStyle(.secondary)
                    }
            }
            stats
        }
    }

    private var stageHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let date = stageDate(
                date: dashboard.stage.date,
                orderIndex: dashboard.stage.orderIndex,
                trailStartDate: dashboard.trail.startDate
            ) {
                Text(formatStageDate(date))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            Text(displayTitle)
                .font(.title2.bold())
            if let direction {
                Label("Směr \(direction.label)", systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
        }
    }

    private var stats: some View {
        HStack(spacing: 8) {
            StatTile(value: String(format: "%.1f km", dashboard.stage.distanceKm), label: "Vzdálenost")
            StatTile(value: String(format: "+%.0f m", dashboard.stage.ascentM), label: "Stoupání")
            StatTile(value: formattedETA, label: "ETA")
        }
    }

    private var summary: some View {
        Text(dashboard.summary)
            .font(.body)
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background, in: RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
            }
    }

    private func notesPanel(_ notes: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Poznámky")
                .font(.caption.weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            Text(notes)
                .font(.subheadline)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
        }
    }

    private var formattedETA: String {
        let h = Int(etaHours)
        let m = Int((etaHours - Double(h)) * 60)
        if h == 0 { return "\(m) min" }
        if m == 0 { return "\(h) h" }
        return "\(h) h \(m) min"
    }
}

private struct WeatherAlertStatusPanel: View {
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 3) {
                Text("Meteorologické výstrahy")
                    .font(.subheadline.weight(.semibold))
                Text("Kontrola MeteoAlarm zatím není v iOS cache dostupná.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
        }
    }
}

private struct RouteProfilePanel: View {
    let profile: [ElevationPoint]
    let rain: RainOnset?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Profil trasy")
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Spacer()
                if let rain {
                    Label(String(format: "%.1f km", rain.distanceKm), systemImage: "cloud.rain")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            ElevationProfileChart(profile: profile, rain: rain)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
        }
    }
}

private struct ElevationProfileChart: View {
    let profile: [ElevationPoint]
    let rain: RainOnset?

    private var maxDistanceKm: Double {
        max(profile.last?.dKm ?? 0, 0)
    }

    private var minElevationM: Int {
        Int((profile.map(\.eleM).min() ?? 0).rounded())
    }

    private var maxElevationM: Int {
        Int((profile.map(\.eleM).max() ?? 0).rounded())
    }

    var body: some View {
        VStack(spacing: 4) {
            HStack(alignment: .center, spacing: 6) {
                Text("Výška (m)")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(-90))
                    .fixedSize()
                    .frame(width: 18, height: 126)

                VStack(spacing: 3) {
                    HStack {
                        Text("\(maxElevationM) m")
                        Spacer()
                    }
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)

                    ElevationProfileGraph(profile: profile, rain: rain)
                        .frame(height: 112)

                    HStack {
                        Text("0 km")
                        Spacer()
                        Text(String(format: "%.1f km", maxDistanceKm))
                    }
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                }
            }

            Text("Vzdálenost (km)")
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.leading, 24)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Výškový profil. Osa X vzdálenost v kilometrech, osa Y výška v metrech.")
        .accessibilityValue("Od \(minElevationM) do \(maxElevationM) metrů, délka \(String(format: "%.1f", maxDistanceKm)) kilometru.")
    }
}

private struct ElevationProfileGraph: View {
    let profile: [ElevationPoint]
    let rain: RainOnset?

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let maxDist = max(profile.last?.dKm ?? 0.1, 0.1)
            let elevations = profile.map(\.eleM)
            let minEle = elevations.min() ?? 0
            let maxEle = elevations.max() ?? 1
            let range = max(maxEle - minEle, 1)
            let yMin = minEle - range * 0.12
            let yMax = maxEle + range * 0.12
            let yRange = max(yMax - yMin, 1)

            let points = profile.map { point in
                CGPoint(
                    x: CGFloat(point.dKm / maxDist) * size.width,
                    y: size.height - CGFloat((point.eleM - yMin) / yRange) * size.height
                )
            }

            ZStack {
                Path { path in
                    guard let first = points.first else { return }
                    path.move(to: CGPoint(x: first.x, y: size.height))
                    for point in points { path.addLine(to: point) }
                    if let last = points.last {
                        path.addLine(to: CGPoint(x: last.x, y: size.height))
                    }
                    path.closeSubpath()
                }
                .fill(.orange.opacity(0.2))

                Path { path in
                    guard let first = points.first else { return }
                    path.move(to: first)
                    for point in points.dropFirst() { path.addLine(to: point) }
                }
                .stroke(.orange, style: StrokeStyle(lineWidth: 2, lineJoin: .round))

                ForEach([0.0, 0.5, 1.0], id: \.self) { fraction in
                    Path { path in
                        let y = size.height * fraction
                        path.move(to: CGPoint(x: 0, y: y))
                        path.addLine(to: CGPoint(x: size.width, y: y))
                    }
                    .stroke(.quaternary, lineWidth: 1)
                }

                if let rain, let elevation = rain.elevationM {
                    let x = CGFloat(min(max(rain.distanceKm / maxDist, 0), 1)) * size.width
                    let y = size.height - CGFloat((Double(elevation) - yMin) / yRange) * size.height
                    Path { path in
                        path.move(to: CGPoint(x: x, y: 0))
                        path.addLine(to: CGPoint(x: x, y: size.height))
                    }
                    .stroke(.primary, style: StrokeStyle(lineWidth: 1.2, dash: [3, 2]))
                    Circle()
                        .fill(.background)
                        .stroke(.primary, lineWidth: 2)
                        .frame(width: 10, height: 10)
                        .position(x: x, y: y)
                    Image(systemName: "cloud.bolt.fill")
                        .font(.caption)
                        .position(x: min(x + 14, size.width - 10), y: 10)
                }
            }
        }
    }
}

private struct EtaPrecipTimelinePanel: View {
    let rows: [RouteTimelineRow]
    let startHour: Int
    let hasForecast: Bool
    let updateStartHour: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Kde budeš v kolik · ETA × srážky")
                        .font(.caption.weight(.semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(statusText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Stepper(value: Binding(
                    get: { startHour },
                    set: { updateStartHour($0) }
                ), in: 0 ... 23) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Odchod")
                            .font(.caption2.weight(.semibold))
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        Text(String(format: "%02d:00", startHour))
                            .font(.subheadline.weight(.semibold).monospacedDigit())
                    }
                }
            }

            VStack(spacing: 4) {
                ForEach(rows) { row in
                    TimelineRow(row: row)
                }
            }
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
        }
    }

    private var statusText: String {
        guard hasForecast else { return "Počasí zatím není v cache." }
        return rows.contains(where: \.isStorm)
            ? "Srážkový řádek je zvýrazněný."
            : "Po trase zatím bez významných srážek."
    }
}

private struct TimelineRow: View {
    let row: RouteTimelineRow

    var body: some View {
        HStack(spacing: 12) {
            Text(timeLabel(row.hour))
                .font(.caption.monospacedDigit().weight(.semibold))
                .frame(width: 42, alignment: .leading)
                .foregroundStyle(row.isStorm ? .orange : .secondary)
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(row.isStorm ? .white : .secondary)
                .frame(width: 24, height: 24)
                .background(row.isStorm ? Color.orange : Color.secondary.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(row.detail != nil && !row.isStorm ? "\(row.detail!) · \(row.title)" : row.title)
                    .font(.subheadline.weight(row.isStorm ? .bold : .medium))
                    .lineLimit(1)
                Text(meta)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(row.isStorm ? Color.orange.opacity(0.14) : Color.clear, in: RoundedRectangle(cornerRadius: 8))
    }

    private var meta: String {
        var parts = [String(format: "%.1f km", row.distanceKm)]
        if let elevation = row.elevationM { parts.append("\(elevation) m") }
        if row.isStorm, let precip = row.precipMm { parts.append(String(format: "%.1f mm/h", precip)) }
        return parts.joined(separator: " · ")
    }

    private var icon: String {
        switch row.kind {
        case .start: return "flag.fill"
        case .water: return "drop.fill"
        case .peak: return "mountain.2.fill"
        case .town: return "house.fill"
        case .camp: return "tent.fill"
        case .shelter: return "shield.fill"
        case .resupply: return "shippingbox.fill"
        case .storm: return "cloud.bolt.fill"
        case .finish: return "flag.checkered"
        case .other: return "mappin.circle.fill"
        }
    }

    private func timeLabel(_ hour: Double) -> String {
        let total = Int((hour * 60).rounded())
        let h = (total / 60) % 24
        let m = total % 60
        return String(format: "%02d:%02d", h, m)
    }
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
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
        }
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
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
        }
    }
}
