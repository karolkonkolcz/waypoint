//
//  Difficulty.swift
//  WaypointiOS
//
//  Verbatim port of web/lib/domain/difficulty.ts.
//  Constants are canonical in ARCHITECTURE.md §10.1 — change there first.
//

import Foundation

// MARK: - Types

enum DifficultyClass: String, Codable, Sendable {
    case easy, moderate, hard, extreme
}

struct DifficultyInput: Sendable {
    let distanceKm: Double
    let ascentM: Double
    let descentM: Double
}

struct DifficultyResult: Sendable {
    let score: Int
    let klass: DifficultyClass
    let effortKm: Double
}

// MARK: - Constants (ARCHITECTURE.md §10.1)

private let ascentW: Double = 0.85
private let descentW: Double = 0.25
private let extremeEffortKm: Double = 45

// MARK: - Engine

func scoreDifficulty(_ i: DifficultyInput) -> DifficultyResult {
    let effortKm = i.distanceKm
        + (i.ascentM / 100) * ascentW
        + (i.descentM / 100) * descentW

    let score = max(0, min(100, Int((effortKm / extremeEffortKm * 100).rounded())))

    let klass: DifficultyClass =
        score <= 25 ? .easy
        : score <= 50 ? .moderate
        : score <= 75 ? .hard
        : .extreme

    return DifficultyResult(score: score, klass: klass, effortKm: effortKm)
}
