//
//  CurrentLocationProvider.swift
//  WaypointiOS
//
//  A thin, reusable wrapper around CLLocationManager that publishes a live
//  `[lon, lat]` fix as an `@Observable`. Unlike WeatherTabViewModel (which wants
//  a single fix), this keeps updating while a view is on screen — so the Today
//  profile can show "you are here" moving along the route. Permission reuses the
//  same NSLocationWhenInUseUsageDescription the weather tab already requires.
//

import CoreLocation
import Observation

@MainActor
@Observable
final class CurrentLocationProvider: NSObject, CLLocationManagerDelegate {
    /// Latest fix as (lon, lat), nil until the first update arrives.
    private(set) var coordinate: Coord2?

    private let manager = CLLocationManager()
    private var updating = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 15 // metres — don't spam the projection for tiny jitters
    }

    /// Begin streaming location, requesting permission if still undetermined.
    /// Safe to call repeatedly (e.g. on every `onAppear`).
    func start() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            beginUpdates()
        default:
            break // denied/restricted — silently stay location-less
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
        updating = false
    }

    private func beginUpdates() {
        guard !updating else { return }
        updating = true
        manager.startUpdatingLocation()
    }

    // MARK: - CLLocationManagerDelegate

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let coord = Coord2(lon: location.coordinate.longitude, lat: location.coordinate.latitude)
        Task { @MainActor in self.coordinate = coord }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Transient failures are fine — the next fix will arrive or the view closes.
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                self.beginUpdates()
            default:
                break
            }
        }
    }
}
