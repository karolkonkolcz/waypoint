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
                removeTodo: model.removeTodo
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

    private var etaHours: Double {
        naismithHours(
            distanceKm: dashboard.stage.distanceKm,
            ascentM: dashboard.stage.ascentM,
            paceKmh: dashboard.trail.defaultPaceKmh
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                hero
                stats
                weather
                Text(dashboard.summary)
                    .font(.body)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.background, in: RoundedRectangle(cornerRadius: 8))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
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
    private var hero: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(dashboard.greeting)
                .font(.title2.bold())
            Text(dashboard.stage.title)
                .font(.headline)
                .foregroundStyle(.secondary)

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
                Text("Počasí")
                    .font(.headline)
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
            .background(.background, in: RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8).stroke(.quaternary)
            }
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
