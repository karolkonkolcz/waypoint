import SwiftUI

struct WaypointEditView: View {
    let trailId: String
    var waypoint: Waypoint?

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var type: String
    @State private var latText: String
    @State private var lonText: String
    @State private var elevText: String
    @State private var distText: String
    @State private var description: String
    @State private var errorMessage: String?

    private let repo = WaypointRepository()

    private let waypointTypes = ["camp", "water", "hut", "viewpoint", "road", "other"]

    init(trailId: String, waypoint: Waypoint? = nil) {
        self.trailId = trailId
        self.waypoint = waypoint
        _name = State(initialValue: waypoint?.name ?? "")
        _type = State(initialValue: waypoint?.type ?? "other")
        _latText = State(initialValue: waypoint.map { String($0.latitude) } ?? "")
        _lonText = State(initialValue: waypoint.map { String($0.longitude) } ?? "")
        _elevText = State(initialValue: waypoint?.elevationM.map(String.init) ?? "")
        _distText = State(initialValue: waypoint?.distanceAlongRouteKm.map { String(format: "%.2f", $0) } ?? "")
        _description = State(initialValue: waypoint?.description ?? "")
    }

    private var isEditing: Bool { waypoint != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Bod") {
                    TextField("Název", text: $name)
                    Picker("Typ", selection: $type) {
                        ForEach(waypointTypes, id: \.self) { t in
                            Text(typeLabel(t)).tag(t)
                        }
                    }
                }

                Section("Poloha") {
                    TextField("Zeměpisná šířka", text: $latText)
                        .keyboardType(.decimalPad)
                    TextField("Zeměpisná délka", text: $lonText)
                        .keyboardType(.decimalPad)
                    TextField("Nadmořská výška (m)", text: $elevText)
                        .keyboardType(.numberPad)
                    TextField("Vzdálenost na trase (km)", text: $distText)
                        .keyboardType(.decimalPad)
                }

                Section("Poznámky") {
                    TextField("Popis", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(isEditing ? "Upravit bod" : "Nový bod")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { save() }
                        .disabled(trimmedName.isEmpty || parsedLat == nil || parsedLon == nil)
                }
            }
        }
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var parsedLat: Double? { Double(latText.trimmingCharacters(in: .whitespaces)) }
    private var parsedLon: Double? { Double(lonText.trimmingCharacters(in: .whitespaces)) }

    private func save() {
        guard let lat = parsedLat, let lon = parsedLon else { return }
        let desc = description.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            if let waypoint {
                _ = try repo.update(id: waypoint.id) { row in
                    row.name = trimmedName
                    row.type = type
                    row.latitude = lat
                    row.longitude = lon
                    row.elevationM = Int(elevText.trimmingCharacters(in: .whitespaces))
                    row.distanceAlongRouteKm = Double(distText.trimmingCharacters(in: .whitespaces))
                    row.description = desc.isEmpty ? nil : desc
                }
            } else {
                guard let userId = SupabaseManager.shared.currentUserId else {
                    errorMessage = "Nejsi přihlášen."
                    return
                }
                _ = try repo.create(.init(
                    trailId: trailId,
                    userId: userId,
                    name: trimmedName,
                    type: type,
                    latitude: lat,
                    longitude: lon,
                    elevationM: Int(elevText.trimmingCharacters(in: .whitespaces)),
                    distanceAlongRouteKm: Double(distText.trimmingCharacters(in: .whitespaces)),
                    description: desc.isEmpty ? nil : desc
                ))
            }
            Task { await SyncEngine.shared.sync() }
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func typeLabel(_ type: String) -> String {
        switch type {
        case "camp": return "Tábořiště"
        case "water": return "Voda"
        case "hut": return "Chata"
        case "viewpoint": return "Vyhlídka"
        case "road": return "Přístupová cesta"
        default: return "Jiné"
        }
    }
}
