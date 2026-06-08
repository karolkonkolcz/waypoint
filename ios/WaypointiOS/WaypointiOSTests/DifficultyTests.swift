//
//  DifficultyTests.swift
//  WaypointiOSTests
//
//  Port of web/lib/domain/__tests__/difficulty.test.ts — same cases, same expected values.
//

import Testing
@testable import WaypointiOS

@Suite("scoreDifficulty")
struct DifficultyTests {

    @Test func flatShortStageIsEasy() {
        let r = scoreDifficulty(DifficultyInput(distanceKm: 8, ascentM: 100, descentM: 100))
        #expect(r.klass == .easy)
        #expect(r.score <= 25)
    }

    @Test func typicalTrailDayIsModerate() {
        let r = scoreDifficulty(DifficultyInput(distanceKm: 15, ascentM: 600, descentM: 400))
        #expect(r.klass == .moderate)
    }

    @Test func hardAlpineDayIsHard() {
        // effortKm = 20 + (1200/100)*0.85 + (600/100)*0.25 = 20 + 10.2 + 1.5 = 31.7 → score ≈ 70 → hard
        let r = scoreDifficulty(DifficultyInput(distanceKm: 20, ascentM: 1200, descentM: 600))
        #expect(r.klass == .hard)
    }

    @Test func extremeDayClampedTo100() {
        let r = scoreDifficulty(DifficultyInput(distanceKm: 35, ascentM: 2000, descentM: 1500))
        #expect(r.klass == .extreme)
        #expect(r.score == 100)
    }

    @Test func scoreAlwaysBetween0And100() {
        let cases: [DifficultyInput] = [
            .init(distanceKm: 0, ascentM: 0, descentM: 0),
            .init(distanceKm: 100, ascentM: 5000, descentM: 5000),
        ]
        for c in cases {
            let s = scoreDifficulty(c).score
            #expect(s >= 0)
            #expect(s <= 100)
        }
    }

    @Test func effortKmIncreasesWithAscent() {
        let base = scoreDifficulty(DifficultyInput(distanceKm: 20, ascentM: 0, descentM: 0))
        let withAscent = scoreDifficulty(DifficultyInput(distanceKm: 20, ascentM: 1000, descentM: 0))
        #expect(withAscent.effortKm > base.effortKm)
    }
}
