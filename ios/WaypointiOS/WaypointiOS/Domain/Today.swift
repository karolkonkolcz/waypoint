import Foundation

func localToday() -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date())
}

func greeting(date: Date = Date(), name: String = "") -> String {
    let hour = Calendar.current.component(.hour, from: date)
    let word: String
    if hour < 5 {
        word = "Dobrou noc"
    } else if hour < 12 {
        word = "Dobré ráno"
    } else if hour < 17 {
        word = "Dobré odpoledne"
    } else if hour < 21 {
        word = "Dobrý večer"
    } else {
        word = "Dobrou noc"
    }

    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? word : "\(word), \(trimmed)"
}

func resolveActiveTrail(trails: [Trail], stageCountByTrail: [String: Int], today: String) -> Trail? {
    guard !trails.isEmpty else { return nil }

    for trail in trails {
        guard let startDate = trail.startDate else { continue }
        let days = stageCountByTrail[trail.id] ?? 0
        guard days > 0 else { continue }
        let endDate = addDays(iso: startDate, days: days - 1)
        if startDate <= today && today <= endDate {
            return trail
        }
    }

    return trails.first
}

func buildDaySummary(stage: Stage, snapshot: WeatherSnapshot?) -> String {
    let weather = weatherClause(snapshot)

    if stage.stageType == "transit" {
        return weather.map { "Přesunový den do \(stage.title) — \($0)." }
            ?? "Přesunový den do \(stage.title)."
    }

    let difficultyWord = difficultyWord(stage.difficultyClass)
    let base = "Dnes tě čeká \(difficultyWord) den: \(String(format: "%.1f", stage.distanceKm)) km s \(climbClause(stage.ascentM))"
    return weather.map { "\(base) — \($0)." } ?? "\(base)."
}

private func difficultyWord(_ raw: String?) -> String {
    switch raw?.lowercased() {
    case "easy": return "snadný"
    case "moderate": return "středně náročný"
    case "hard": return "těžký"
    case "extreme": return "extrémní"
    default: return "stabilní"
    }
}

private func climbClause(_ ascentM: Double) -> String {
    let ascent = Int(ascentM.rounded())
    if ascentM < 200 { return "malým stoupáním" }
    if ascentM < 600 { return "\(ascent) m stoupání" }
    if ascentM < 1200 { return "poctivým stoupáním \(ascent) m" }
    return "velkým stoupáním \(ascent) m"
}

private func weatherClause(_ snapshot: WeatherSnapshot?) -> String? {
    guard let snapshot else { return nil }
    if let moving = snapshot.moving, !moving.isEmpty {
        if let hour = snapshot.rainStartsHour {
            return "déšť tě zastihne kolem \(String(format: "%02d", hour)):00"
        }
        return "po celý den sucho"
    }

    if snapshot.precipTotalMm == 0 { return "po celý den sucho" }
    guard let first = snapshot.entries.first, let last = snapshot.entries.last else {
        return "očekává se \(String(format: "%.1f", snapshot.precipTotalMm)) mm srážek"
    }
    if first.precipMm > 0 && last.precipMm == 0 { return "déšť během dne ustoupí" }
    if first.precipMm == 0 && last.precipMm > 0 { return "déšť přijde později" }
    return "očekává se \(String(format: "%.1f", snapshot.precipTotalMm)) mm srážek"
}
