//
//  DifficultyBadge.swift
//  WaypointiOS
//
//  Pill badge matching the web's difficulty-color tokens (ARCHITECTURE.md §10.1).
//

import SwiftUI

struct DifficultyBadge: View {
    let result: DifficultyResult

    var body: some View {
        Text(label)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(color.opacity(0.4), lineWidth: 1))
    }

    private var label: String {
        switch result.klass {
        case .easy:     return "Snadná"
        case .moderate: return "Střední"
        case .hard:     return "Těžká"
        case .extreme:  return "Extrémní"
        }
    }

    private var color: Color {
        switch result.klass {
        case .easy:     return .green
        case .moderate: return .yellow
        case .hard:     return .orange
        case .extreme:  return .red
        }
    }
}
