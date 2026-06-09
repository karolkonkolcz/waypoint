import SwiftUI

/// Difficulty palette shared across watch screens. Mirrors the iOS map colours.
func watchDifficultyColor(class klass: String?) -> Color {
    switch klass?.lowercased() {
    case "easy": return .green
    case "moderate": return .yellow
    case "hard": return .orange
    case "extreme": return .red
    default: return .gray
    }
}

func formatWatchMinutes(_ minutes: Int) -> String {
    let hours = minutes / 60
    let remainder = minutes % 60
    if hours == 0 { return "\(remainder)m" }
    if remainder == 0 { return "\(hours)h" }
    return "\(hours)h \(remainder)m"
}
