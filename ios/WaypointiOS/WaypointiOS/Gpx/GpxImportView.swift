//
//  GpxImportView.swift
//  WaypointiOS
//
//  Imports a multi-day GPX trek into a new trail. Pick a .gpx file → preview the
//  parsed days/totals → name it + set a start date → import. Writing goes through
//  the local-first repositories; the new trail syncs to Supabase on next push.
//

import SwiftUI
import UniformTypeIdentifiers

struct GpxImportView: View {
    /// Called with the new trail id after a successful import.
    var onImported: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var preview: TrekPreview?
    @State private var trailName = ""
    @State private var hasStartDate = false
    @State private var startDate = Date()
    @State private var paceKmh = 4.0
    @State private var showFileImporter = false
    @State private var isImporting = false
    @State private var errorMessage: String?

    private static let gpxType = UTType(filenameExtension: "gpx") ?? .xml

    var body: some View {
        NavigationStack {
            Group {
                if let preview {
                    previewForm(preview)
                } else {
                    chooseFile
                }
            }
            .navigationTitle("Import GPX")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                if preview != nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Importovat") { runImport() }
                            .disabled(isImporting || trimmedName.isEmpty)
                    }
                }
            }
            .fileImporter(
                isPresented: $showFileImporter,
                allowedContentTypes: [Self.gpxType, .xml],
                allowsMultipleSelection: false
            ) { result in
                handlePicked(result)
            }
        }
    }

    // MARK: - Choose file

    private var chooseFile: some View {
        ContentUnavailableView {
            Label("Vyber GPX soubor", systemImage: "square.and.arrow.down")
        } description: {
            Text("Z GPX trasy vytvoříme novou trasu s jednou etapou na den.")
        } actions: {
            Button("Vybrat soubor") { showFileImporter = true }
                .buttonStyle(.borderedProminent)
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
    }

    // MARK: - Preview + options

    private func previewForm(_ preview: TrekPreview) -> some View {
        Form {
            Section("Trasa") {
                TextField("Název", text: $trailName)
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

            Section("Souhrn") {
                LabeledContent("Dnů", value: "\(preview.dayCount)")
                LabeledContent("Vzdálenost", value: String(format: "%.1f km", preview.totalDistanceKm))
                LabeledContent("Převýšení", value: "+\(preview.totalAscentM) m")
            }

            Section("Etapy") {
                ForEach(Array(preview.tracks.enumerated()), id: \.offset) { index, track in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.name ?? "Den \(index + 1)")
                            .font(.subheadline.weight(.medium))
                        Text(String(
                            format: "%.1f km · +%d m",
                            track.gpx.totalDistanceKm,
                            track.gpx.totalAscentM
                        ))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
        }
    }

    // MARK: - Actions

    private var trimmedName: String {
        trailName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func handlePicked(_ result: Result<[URL], Error>) {
        errorMessage = nil
        do {
            guard let url = try result.get().first else { return }
            let needsScope = url.startAccessingSecurityScopedResource()
            defer { if needsScope { url.stopAccessingSecurityScopedResource() } }

            let text = try String(contentsOf: url, encoding: .utf8)
            let built = try GpxImporter.buildPreview(xmlText: text, fileName: url.lastPathComponent)
            preview = built
            trailName = built.trailName
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func runImport() {
        guard let preview else { return }
        guard let userId = SupabaseManager.shared.currentUserId else {
            errorMessage = "Nejsi přihlášen."
            return
        }
        isImporting = true
        errorMessage = nil
        do {
            let result = try GpxImporter.importTrek(
                tracks: preview.tracks,
                userId: userId,
                trailName: trimmedName,
                startDate: hasStartDate ? isoDay(startDate) : nil,
                defaultPaceKmh: paceKmh
            )
            Task { await SyncEngine.shared.sync() }
            onImported(result.trailId)
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            isImporting = false
        }
    }
}

/// "YYYY-MM-DD" in the device's local calendar — matches the DATE column shape.
func isoDay(_ date: Date) -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.timeZone = .current
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}
