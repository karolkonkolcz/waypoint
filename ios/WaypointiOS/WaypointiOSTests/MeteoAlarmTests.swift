//
//  MeteoAlarmTests.swift
//  WaypointiOSTests
//
//  Port of web/lib/alerts/__tests__/meteoalarm coverage.
//

import Foundation
import Testing
@testable import WaypointiOS

@Suite("meteoalarm")
struct MeteoAlarmTests {

    private func feed(level: String, type: String, expires: String, areas: [String], language: String = "cs-CZ") -> [String: Any] {
        [
            "warnings": [[
                "alert": ["info": [[
                    "language": language,
                    "event": "raw",
                    "description": "popis",
                    "senderName": "CHMI",
                    "expires": expires,
                    "onset": "2026-06-09T06:00:00+00:00",
                    "area": areas.map { ["areaDesc": $0] },
                    "parameter": [
                        ["valueName": "awareness_level", "value": level],
                        ["valueName": "awareness_type", "value": type],
                    ],
                ]]],
            ]],
        ]
    }

    @Test func parsesActiveThunderstorm() {
        let raw = feed(level: "3; orange; Severe", type: "3; Thunderstorm",
                       expires: "2026-06-10T00:00:00+00:00", areas: ["Praha", "Brno"])
        let alerts = parseMeteoalarmFeed(raw, now: dateOf("2026-06-09T12:00:00+00:00"))
        #expect(alerts.count == 1)
        #expect(alerts.first?.event == "Bouřky")
        #expect(alerts.first?.severity == .orange)
        #expect(alerts.first?.areas == ["Praha", "Brno"])
    }

    @Test func dropsExpiredWarnings() {
        let raw = feed(level: "2; yellow; Moderate", type: "1; Wind",
                       expires: "2026-06-08T00:00:00+00:00", areas: ["Plzeň"])
        let alerts = parseMeteoalarmFeed(raw, now: dateOf("2026-06-09T12:00:00+00:00"))
        #expect(alerts.isEmpty)
    }

    @Test func dropsGreenLevel() {
        let raw = feed(level: "1; green; Minor", type: "1; Wind",
                       expires: "2026-06-10T00:00:00+00:00", areas: ["Plzeň"])
        let alerts = parseMeteoalarmFeed(raw, now: dateOf("2026-06-09T12:00:00+00:00"))
        #expect(alerts.isEmpty)
    }

    @Test func slugMapsCoordinateToCountry() {
        #expect(slugFromLatLon(lat: 50.08, lon: 14.43) == "czechia")  // Praha
        #expect(slugFromLatLon(lat: 49.12, lon: 20.08) == "slovakia") // Tatry
        #expect(slugFromLatLon(lat: 0, lon: 0) == nil)
    }

    private func dateOf(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }
}
