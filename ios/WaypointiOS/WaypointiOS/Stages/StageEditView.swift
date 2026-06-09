//
//  StageEditView.swift
//  WaypointiOS
//
//  Create / edit a stage. trek stages carry distance/ascent/descent (difficulty
//  is recomputed by StageRepository); transit stages are travel days. Writes go
//  through StageRepository (GRDB + sync queue).
//

import SwiftUI

struct StageEditView: View {
    let trailId: String
    /// nil → create a new stage appended to the end. Non-nil → edit that stage.
    var stage: Stage?
    /// Used only when creating, to append after the current last stage.
    var nextOrderIndex: Int = 0

    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var stageType: String
    @State private var distanceKm: Double
    @State private var ascentM: Double
    @State private var descentM: Double
    @State private var notes: String
    @State private var hasDateOverride: Bool
    @State private var date: Date
    @State private var errorMessage: String?

    private let repo = StageRepository()

    init(trailId: String, stage: Stage? = nil, nextOrderIndex: Int = 0) {
        self.trailId = trailId
        self.stage = stage
        self.nextOrderIndex = nextOrderIndex
        _title = State(initialValue: stage?.title ?? "")
        _stageType = State(initialValue: stage?.stageType ?? "trek")
        _distanceKm = State(initialValue: stage?.distanceKm ?? 0)
        _ascentM = State(initialValue: stage?.ascentM ?? 0)
        _descentM = State(initialValue: stage?.descentM ?? 0)
        _notes = State(initialValue: stage?.notes ?? "")
        _hasDateOverride = State(initialValue: stage?.date != nil)
        _date = State(initialValue: stage?.date.flatMap(parseIsoDay) ?? Date())
    }

    private var isEditing: Bool { stage != nil }
    private var isTransit: Bool { stageType == "transit" }
    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private let routeRepo = RouteRepository()

    var body: some View {
        NavigationStack {
            Form {
                Section("Etapa") {
                    TextField(fallbackTitle(), text: $title)
                    Picker("Typ", selection: $stageType.animation()) {
                        Text("Pěší den").tag("trek")
                        Text("Přesun").tag("transit")
                    }
                    .pickerStyle(.segmented)
                }

                if !isTransit {
                    Section("Profil") {
                        numberRow("Vzdálenost", value: $distanceKm, unit: "km", step: 0.5)
                        numberRow("Stoupání", value: $ascentM, unit: "m", step: 50)
                        numberRow("Klesání", value: $descentM, unit: "m", step: 50)
                    }
                }

                Section("Datum") {
                    Toggle("Vlastní datum", isOn: $hasDateOverride.animation())
                    if hasDateOverride {
                        DatePicker("Datum", selection: $date, displayedComponents: .date)
                    } else {
                        Text("Odvozeno z data začátku trasy a pořadí.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Poznámky") {
                    TextField("Poznámky", text: $notes, axis: .vertical)
                        .lineLimit(2 ... 6)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(isEditing ? "Upravit etapu" : "Nová etapa")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { save() }
                }
            }
        }
    }

    private func numberRow(_ label: String, value: Binding<Double>, unit: String, step: Double) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField(label, value: value, format: .number)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 90)
            Text(unit).foregroundStyle(.secondary)
            Stepper(label, value: value, in: 0 ... 100_000, step: step)
                .labelsHidden()
        }
    }

    private func save() {
        let dateIso = hasDateOverride ? isoDay(date) : nil
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let titleToSave = trimmedTitle.isEmpty ? fallbackTitle() : trimmedTitle
        do {
            if let stage {
                _ = try repo.update(id: stage.id) { row in
                    row.title = titleToSave
                    row.stageType = stageType
                    row.distanceKm = isTransit ? 0 : distanceKm
                    row.ascentM = isTransit ? 0 : ascentM
                    row.descentM = isTransit ? 0 : descentM
                    row.notes = trimmedNotes.isEmpty ? nil : trimmedNotes
                    row.date = dateIso
                }
            } else {
                guard let userId = SupabaseManager.shared.currentUserId else {
                    errorMessage = "Nejsi přihlášen."
                    return
                }
                _ = try repo.create(.init(
                    trailId: trailId,
                    userId: userId,
                    title: titleToSave,
                    orderIndex: nextOrderIndex,
                    stageType: stageType,
                    date: dateIso,
                    distanceKm: distanceKm,
                    ascentM: ascentM,
                    descentM: descentM,
                    notes: trimmedNotes.isEmpty ? nil : trimmedNotes
                ))
            }
            Task { await SyncEngine.shared.sync() }
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func fallbackTitle() -> String {
        let line = stage.flatMap { stage in
            (try? routeRepo.findByStage(stageId: stage.id)).flatMap { decodeLineString($0.geojson) }
        }
        if let stage {
            return generatedStageTitle(stage: stage, line: line, fallbackIndex: stage.orderIndex + 1)
        }
        return stageType == "transit" ? "Přesunový den \(nextOrderIndex + 1)" : "Den \(nextOrderIndex + 1)"
    }
}
