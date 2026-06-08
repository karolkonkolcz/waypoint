//
//  TrailEditView.swift
//  WaypointiOS
//
//  Create / edit a trail (name, description, start date, default pace). Writes
//  go through TrailRepository (GRDB + sync queue); nothing hits Supabase here.
//

import SwiftUI

struct TrailEditView: View {
    /// nil → create a new trail. Non-nil → edit that trail.
    var trail: Trail?

    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var description: String
    @State private var hasStartDate: Bool
    @State private var startDate: Date
    @State private var paceKmh: Double
    @State private var errorMessage: String?

    private let repo = TrailRepository()

    init(trail: Trail? = nil) {
        self.trail = trail
        _name = State(initialValue: trail?.name ?? "")
        _description = State(initialValue: trail?.description ?? "")
        _hasStartDate = State(initialValue: trail?.startDate != nil)
        _startDate = State(initialValue: trail?.startDate.flatMap(parseIsoDay) ?? Date())
        _paceKmh = State(initialValue: trail?.defaultPaceKmh ?? 4)
    }

    private var isEditing: Bool { trail != nil }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Trasa") {
                    TextField("Název", text: $name)
                    TextField("Popis", text: $description, axis: .vertical)
                        .lineLimit(2 ... 5)
                }

                Section("Plán") {
                    Toggle("Datum začátku", isOn: $hasStartDate.animation())
                    if hasStartDate {
                        DatePicker("Začátek", selection: $startDate, displayedComponents: .date)
                    }
                    HStack {
                        Text("Tempo")
                        Spacer()
                        Text("\(paceKmh, specifier: "%.1f") km/h")
                            .foregroundStyle(.secondary)
                    }
                    Slider(value: $paceKmh, in: 2 ... 6, step: 0.5)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(isEditing ? "Upravit trasu" : "Nová trasa")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { save() }
                        .disabled(trimmedName.isEmpty)
                }
            }
        }
    }

    private func save() {
        let startIso = hasStartDate ? isoDay(startDate) : nil
        let desc = description.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if let trail {
                _ = try repo.update(id: trail.id) { row in
                    row.name = trimmedName
                    row.description = desc.isEmpty ? nil : desc
                    row.startDate = startIso
                    row.defaultPaceKmh = paceKmh
                }
            } else {
                guard let userId = SupabaseManager.shared.currentUserId else {
                    errorMessage = "Nejsi přihlášen."
                    return
                }
                _ = try repo.create(.init(
                    userId: userId,
                    name: trimmedName,
                    description: desc.isEmpty ? nil : desc,
                    startDate: startIso,
                    defaultPaceKmh: paceKmh
                ))
            }
            Task { await SyncEngine.shared.sync() }
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Parses a "YYYY-MM-DD" DATE string into a local-noon Date (avoids DST edges).
func parseIsoDay(_ iso: String) -> Date? {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.timeZone = .current
    f.dateFormat = "yyyy-MM-dd"
    return f.date(from: String(iso.prefix(10)))
}
