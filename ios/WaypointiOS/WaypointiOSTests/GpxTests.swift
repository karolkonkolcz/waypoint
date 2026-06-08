import Foundation
import Testing
@testable import WaypointiOS

// Ports web/lib/gpx/__tests__/parse.test.ts. The numbers must match the web
// parser exactly so an iOS import produces the same rows as the PWA.

@Suite("Gpx")
struct GpxTests {
    static let simpleGpx = """
    <?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1" creator="test">
      <trk>
        <trkseg>
          <trkpt lat="47.0" lon="8.0"><ele>500</ele></trkpt>
          <trkpt lat="47.1" lon="8.0"><ele>600</ele></trkpt>
          <trkpt lat="47.2" lon="8.0"><ele>550</ele></trkpt>
        </trkseg>
      </trk>
    </gpx>
    """

    static let routeGpx = """
    <?xml version="1.0"?>
    <gpx version="1.1" creator="test">
      <rte>
        <rtept lat="47.0" lon="8.0"><ele>500</ele></rtept>
        <rtept lat="47.1" lon="8.0"><ele>600</ele></rtept>
      </rte>
    </gpx>
    """

    private func parseSingle(_ xml: String) throws -> ParsedGpx {
        let tracks = try parseGpxTracks(xml)
        return try #require(tracks.first).gpx
    }

    @Test func extractsCoordinatesInGeoJSONOrder() throws {
        let gpx = try parseSingle(Self.simpleGpx)
        #expect(gpx.coordinates.count == 3)
        // GeoJSON [lon, lat, ele] — swapped from GPX lat/lon attribute order.
        #expect(gpx.coordinates[0] == [8.0, 47.0, 500])
    }

    @Test func computesTotalDistance() throws {
        let gpx = try parseSingle(Self.simpleGpx)
        #expect(gpx.totalDistanceKm > 22)
        #expect(gpx.totalDistanceKm < 23)
    }

    @Test func computesAscentAndDescent() throws {
        let gpx = try parseSingle(Self.simpleGpx)
        #expect(gpx.totalAscentM == 100) // 500 → 600
        #expect(gpx.totalDescentM == 50) // 600 → 550
    }

    @Test func buildsElevationProfile() throws {
        let gpx = try parseSingle(Self.simpleGpx)
        #expect(gpx.elevationProfile.count == 3)
        #expect(gpx.elevationProfile[0].dKm == 0)
        #expect(gpx.elevationProfile[0].eleM == 500)
        #expect(gpx.elevationProfile[2].eleM == 550)
    }

    @Test func supportsRouteFormat() throws {
        let gpx = try parseSingle(Self.routeGpx)
        #expect(gpx.coordinates.count == 2)
        #expect(gpx.totalAscentM == 100)
    }

    @Test func missingElevationIsZero() throws {
        let noEle = """
        <gpx><trk><trkseg>
          <trkpt lat="47.0" lon="8.0"/>
          <trkpt lat="47.1" lon="8.0"/>
        </trkseg></trk></gpx>
        """
        let gpx = try parseSingle(noEle)
        #expect(gpx.totalAscentM == 0)
        #expect(gpx.totalDescentM == 0)
        #expect(gpx.coordinates[0][2] == 0)
    }

    @Test func filtersSubNoiseElevation() throws {
        let noisy = """
        <gpx><trk><trkseg>
          <trkpt lat="47.0" lon="8.0"><ele>500</ele></trkpt>
          <trkpt lat="47.1" lon="8.0"><ele>502</ele></trkpt>
          <trkpt lat="47.2" lon="8.0"><ele>500</ele></trkpt>
        </trkseg></trk></gpx>
        """
        let gpx = try parseSingle(noisy)
        #expect(gpx.totalAscentM == 0) // 2 m < NOISE_M=3
        #expect(gpx.totalDescentM == 0)
    }

    @Test func throwsWhenNoTrack() {
        #expect(throws: GpxParseError.self) {
            _ = try parseGpxTracks("<gpx><metadata/></gpx>")
        }
    }

    @Test func throwsWhenFewerThanTwoPoints() {
        let single = """
        <gpx><trk><trkseg>
          <trkpt lat="47.0" lon="8.0"><ele>500</ele></trkpt>
        </trkseg></trk></gpx>
        """
        #expect(throws: GpxParseError.self) {
            _ = try parseGpxTracks(single)
        }
    }

    @Test func downsamplesLargeProfile() throws {
        let points = (0 ..< 600).map { i -> String in
            let lat = String(format: "%.6f", 47 + Double(i) * 0.001)
            return "<trkpt lat=\"\(lat)\" lon=\"8.0\"><ele>\(500 + i)</ele></trkpt>"
        }.joined(separator: "\n")
        let gpx = try parseSingle("<gpx><trk><trkseg>\(points)</trkseg></trk></gpx>")
        #expect(gpx.elevationProfile.count <= 500)
        #expect(gpx.elevationProfile.last?.eleM == 1099) // final elevation preserved
    }

    // MARK: - Multi-day tracks

    static let day1 = """
    <trk><name>Deň 1 - pondelok</name><trkseg>
      <trkpt lat="42.0" lon="9.0"><ele>1000</ele></trkpt>
      <trkpt lat="42.01" lon="9.01"><ele>1100</ele></trkpt>
    </trkseg></trk>
    """
    static let day2 = """
    <trk><name>Deň 2 - utorok</name><trkseg>
      <trkpt lat="42.01" lon="9.01"><ele>1100</ele></trkpt>
      <trkpt lat="42.02" lon="9.02"><ele>1050</ele></trkpt>
    </trkseg></trk>
    """
    static func wrap(_ inner: String) -> String { "<?xml version=\"1.0\"?><gpx version=\"1.1\">\(inner)</gpx>" }

    @Test func returnsOneTrackPerTrkWithDayNumber() throws {
        let tracks = try parseGpxTracks(Self.wrap(Self.day1 + Self.day2))
        #expect(tracks.count == 2)
        #expect(tracks[0].name == "Deň 1 - pondelok")
        #expect(tracks[0].dayNumber == 1)
        #expect(tracks[1].dayNumber == 2)
    }

    @Test func computesPerTrackStatsIndependently() throws {
        let tracks = try parseGpxTracks(Self.wrap(Self.day1 + Self.day2))
        #expect(tracks[0].gpx.totalAscentM == 100)
        #expect(tracks[0].gpx.totalDescentM == 0)
        #expect(tracks[1].gpx.totalAscentM == 0)
        #expect(tracks[1].gpx.totalDescentM == 50)
        #expect(tracks[0].gpx.coordinates.count == 2)
    }

    @Test func ordersReverseExportedDaysByDayNumber() throws {
        // mapy.com exports days last-first.
        let tracks = try parseGpxTracks(Self.wrap(Self.day2 + Self.day1))
        #expect(tracks.map(\.dayNumber) == [1, 2])
    }

    @Test func fallsBackToContinuityOrdering() throws {
        let noNums = Self.wrap(
            Self.day2.replacingOccurrences(of: "Deň 2 - utorok", with: "utorok")
                + Self.day1.replacingOccurrences(of: "Deň 1 - pondelok", with: "pondelok")
        )
        let tracks = try parseGpxTracks(noNums)
        // day1 (ends at 42.01,9.01) should precede day2 (starts there).
        #expect(tracks[0].gpx.coordinates[0] == [9.0, 42.0, 1000])
    }

    @Test func derivesTrailNameFromFileName() {
        #expect(deriveTrailName(fileName: "export-Korzika.gpx") == "Korzika")
        #expect(deriveTrailName(fileName: "gr20_corsica.gpx") == "Gr20 Corsica")
    }
}
