//
//  StageDate.swift
//  WaypointiOS
//
//  Verbatim port of web/lib/domain/stageDate.ts.
//  UTC-safe: all date arithmetic uses UTC components to avoid midnight drift.
//

import Foundation

// MARK: - Helpers

private let utc = TimeZone(identifier: "UTC")!

private func isoParser() -> DateFormatter {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.timeZone = utc
    return f
}

/// Adds `days` calendar days to an ISO date (YYYY-MM-DD); returns an ISO date.
func addDays(iso: String, days: Int) -> String {
    let parser = isoParser()
    guard let date = parser.date(from: iso) else { return iso }
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = utc
    guard let result = cal.date(byAdding: .day, value: days, to: date) else { return iso }
    return parser.string(from: result)
}

/// Calendar date of a stage. Explicit `date` wins; falls back to
/// `trailStartDate + orderIndex` days. Returns nil when neither is available.
func stageDate(date: String?, orderIndex: Int, trailStartDate: String?) -> String? {
    if let d = date, !d.isEmpty { return d }
    if let start = trailStartDate { return addDays(iso: start, days: orderIndex) }
    return nil
}

/// Short human-readable display of an ISO date in Czech: "po 1. 6.".
/// Parsed and formatted in UTC so no timezone shift occurs.
func formatStageDate(_ iso: String) -> String {
    let parser = isoParser()
    guard let date = parser.date(from: iso) else { return iso }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "cs_CZ")
    formatter.timeZone = utc
    formatter.dateFormat = "EEE d. M."
    return formatter.string(from: date)
}
