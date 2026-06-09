import CoreLocation
import GRDB
import MapKit
import SwiftUI

// MARK: - ViewModel

@MainActor
@Observable
final class WeatherTabViewModel: NSObject, CLLocationManagerDelegate {
    enum State {
        case idle
        case locating
        case fetching(lat: Double, lon: Double)
        case loaded(snapshot: WeatherSnapshot, series: MeteogramSeries, place: String?, fetchedAt: Date)
        case offlineFallback(snapshot: WeatherSnapshot, series: MeteogramSeries, label: String)
        case failed(String)
    }

    var state: State = .idle

    enum LocationError: Error { case denied, timeout, unavailable }

    private let locationManager = CLLocationManager()
    private let client = OpenMeteoClient()
    private let weatherRepo = WeatherRepository()
    private var locationContinuation: CheckedContinuation<CLLocation, Error>?
    private var timeoutTask: Task<Void, Never>?
    /// True only while a `requestLocation()` call is waiting for the user to
    /// answer the permission prompt. Guards the auth-change callback so the
    /// system's init-time callback (fired when the delegate is set) can't kick
    /// off a stray location request with no continuation attached.
    private var awaitingAuthorization = false

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func load() async {
        state = .locating

        // Check location authorisation before requesting
        switch locationManager.authorizationStatus {
        case .denied, .restricted:
            await resolveOffline(reason: "Přístup k poloze je zamítnut.")
            return
        default:
            break
        }

        let location: CLLocation
        do {
            location = try await requestLocation()
        } catch {
            await resolveOffline(reason: "Poloha není k dispozici.")
            return
        }

        let lat = location.coordinate.latitude
        let lon = location.coordinate.longitude
        state = .fetching(lat: lat, lon: lon)

        let today = localToday()
        do {
            // Fetch the summary snapshot (condition/current temp) and the richer
            // meteogram forecast concurrently — both hit the same free API.
            async let snapshotResults = client.fetch(
                points: [Coord2(lon: lon, lat: lat)],
                date: today,
                endDate: nil
            )
            async let richForecast = client.fetchRich(lat: lat, lon: lon)

            let results = try await snapshotResults
            guard let result = results.first else { throw OpenMeteoError.requestFailed }
            let snapshot = buildWeatherSnapshot(result, date: today)
            let series = forecastToMeteogram(try await richForecast, hourLimit: 48)

            // Reverse-geocode in background — never gates the chart
            let place = await reverseGeocode(lat: lat, lon: lon)
            state = .loaded(snapshot: snapshot, series: series, place: place, fetchedAt: Date())
        } catch {
            await resolveOffline(reason: "Nepodařilo se načíst počasí.")
        }
    }

    // MARK: - CLLocationManagerDelegate

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.first else { return }
        Task { @MainActor in self.finishLocation(.success(location)) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.finishLocation(.failure(error)) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            // Only react while a request is actively waiting for the prompt;
            // ignore the system's init-time callback.
            guard self.awaitingAuthorization else { return }
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                self.awaitingAuthorization = false
                manager.requestLocation()
            case .denied, .restricted:
                self.finishLocation(.failure(LocationError.denied))
            default:
                break // still .notDetermined — keep waiting
            }
        }
    }

    // MARK: - Helpers

    private func requestLocation() async throws -> CLLocation {
        try await withCheckedThrowingContinuation { continuation in
            locationContinuation = continuation

            // Never hang forever: fall back if no fix arrives in time.
            timeoutTask = Task { @MainActor in
                try? await Task.sleep(for: .seconds(12))
                guard !Task.isCancelled else { return }
                self.finishLocation(.failure(LocationError.timeout))
            }

            if locationManager.authorizationStatus == .notDetermined {
                awaitingAuthorization = true
                locationManager.requestWhenInUseAuthorization()
            } else {
                locationManager.requestLocation()
            }
        }
    }

    /// Resumes the pending continuation exactly once and tears down the timeout.
    private func finishLocation(_ result: Result<CLLocation, Error>) {
        timeoutTask?.cancel()
        timeoutTask = nil
        awaitingAuthorization = false
        guard let continuation = locationContinuation else { return }
        locationContinuation = nil
        continuation.resume(with: result)
    }

    private func resolveOffline(reason: String) async {
        // Try to serve most-recent stage weather from GRDB as offline fallback
        if let (snapshot, series, label) = offlineFallback() {
            state = .offlineFallback(snapshot: snapshot, series: series, label: label)
        } else {
            state = .failed(reason)
        }
    }

    private func offlineFallback() -> (WeatherSnapshot, MeteogramSeries, String)? {
        guard let rows = try? mostRecentWeatherRows(),
              !rows.isEmpty else { return nil }
        let samples = decodeWeatherSamples(rows)
        guard let first = samples.first else { return nil }
        let snapshot = buildWeatherSnapshot(first.result, date: first.date)
        let series = limitedMeteogramSeries(from: first.result, date: first.date, hourLimit: 48)
        let label = "Uložená data z etapy"
        return (snapshot, series, label)
    }

    private func mostRecentWeatherRows() throws -> [WeatherRow] {
        try AppDatabase.shared.dbPool.read { db in
            try WeatherRow
                .order(Column("fetched_at").desc)
                .limit(5)
                .fetchAll(db)
        }
    }

    private func reverseGeocode(lat: Double, lon: Double) async -> String? {
        let location = CLLocation(latitude: lat, longitude: lon)
        guard let request = MKReverseGeocodingRequest(location: location),
              let mapItems = try? await request.mapItems,
              let address = mapItems.first?.addressRepresentations else { return nil }
        let parts = [address.cityName, address.regionName].compactMap { $0 }
        return parts.isEmpty ? nil : parts.prefix(2).joined(separator: ", ")
    }

    private func localToday() -> String {
        let d = Date()
        let cal = Calendar(identifier: .gregorian)
        let comps = cal.dateComponents(in: TimeZone(secondsFromGMT: 0)!, from: d)
        return String(format: "%04d-%02d-%02d", comps.year!, comps.month!, comps.day!)
    }
}

// MARK: - View

struct WeatherTabView: View {
    @State private var model = WeatherTabViewModel()

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Počasí")
                .task { await model.load() }
                .refreshable { await model.load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .idle, .locating, .fetching:
            loadingView

        case .loaded(let snapshot, let series, let place, let fetchedAt):
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    headerRow(snapshot: snapshot, place: place)
                    weatherSummaryCard(snapshot: snapshot, fetchedAt: fetchedAt, isOffline: false)
                    MeteogramView(series: series)
                        .padding()
                        .background(.background, in: RoundedRectangle(cornerRadius: 12))
                        .overlay { RoundedRectangle(cornerRadius: 12).stroke(.quaternary) }
                }
                .padding()
            }

        case .offlineFallback(let snapshot, let series, let label):
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Label(label, systemImage: "wifi.slash")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal)
                    weatherSummaryCard(snapshot: snapshot, fetchedAt: Date.distantPast, isOffline: true)
                    MeteogramView(series: series)
                        .padding()
                        .background(.background, in: RoundedRectangle(cornerRadius: 12))
                        .overlay { RoundedRectangle(cornerRadius: 12).stroke(.quaternary) }
                }
                .padding()
            }

        case .failed(let message):
            ContentUnavailableView {
                Label("Počasí není k dispozici", systemImage: "cloud.slash")
            } description: {
                Text(message)
            } actions: {
                Button("Zkusit znovu") { Task { await model.load() } }
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(loadingLabel)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var loadingLabel: String {
        switch model.state {
        case .locating: return "Zjišťuji polohu…"
        case .fetching: return "Načítám počasí…"
        default: return "Načítám…"
        }
    }

    @ViewBuilder
    private func headerRow(snapshot: WeatherSnapshot, place: String?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                if let place {
                    Label(place, systemImage: "location.fill")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let current = snapshot.entries.first {
                Text("\(current.tempC)°")
                    .font(.system(size: 52, weight: .bold))
                    .monospacedDigit()
            }
        }
    }

    @ViewBuilder
    private func weatherSummaryCard(snapshot: WeatherSnapshot, fetchedAt: Date, isOffline: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let midday = snapshot.entries.first(where: { $0.hour == 12 }) ?? snapshot.entries.first {
                Text("\(weatherConditionLabel(midday.condition)), \(midday.tempC) °C")
                    .font(.headline)
                Text("Srážky \(String(format: "%.1f mm", snapshot.precipTotalMm)) · vítr max \(snapshot.windMaxKmh) km/h")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if !isOffline {
                Text("Aktuální · \(relativeAge(fetchedAt))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).stroke(.quaternary) }
    }
}

private func relativeAge(_ date: Date) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .short
    return formatter.localizedString(for: date, relativeTo: Date())
}
