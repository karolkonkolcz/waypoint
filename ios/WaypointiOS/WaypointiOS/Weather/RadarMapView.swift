import MapLibre
import MapLibreSwiftDSL
import MapLibreSwiftUI
import SwiftUI

// MARK: - ViewModel

/// Drives the RainViewer animation: loads the past-frame list, refreshes it
/// every 10 min, and advances the frame index on an auto-play loop. Port of the
/// web `RadarMap` component (`web/components/weather/RadarMap.tsx`).
@MainActor
@Observable
final class RadarMapViewModel {
    private(set) var frames: [RadarFrame] = []
    var index = 0
    var playing = true
    private(set) var failed = false

    private var playTask: Task<Void, Never>?
    private var refreshTask: Task<Void, Never>?

    private static let frameInterval: Duration = .milliseconds(500)
    private static let refreshInterval: Duration = .seconds(10 * 60)

    var currentFrame: RadarFrame? {
        guard frames.indices.contains(index) else { return nil }
        return frames[index]
    }

    func start() {
        guard refreshTask == nil else { return }
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.reload()
                try? await Task.sleep(for: Self.refreshInterval)
            }
        }
        restartPlayLoop()
    }

    func stop() {
        playTask?.cancel(); playTask = nil
        refreshTask?.cancel(); refreshTask = nil
    }

    func togglePlaying() {
        playing.toggle()
        restartPlayLoop()
    }

    /// Scrubbing pauses playback and jumps to the chosen frame (matches web).
    func scrub(to newIndex: Int) {
        playing = false
        restartPlayLoop()
        index = min(max(newIndex, 0), max(frames.count - 1, 0))
    }

    private func reload() async {
        let list = await RainViewerClient.fetchFrames()
        guard !list.isEmpty else { failed = true; return }
        failed = false
        frames = list
        if index >= list.count { index = list.count - 1 }
    }

    private func restartPlayLoop() {
        playTask?.cancel(); playTask = nil
        guard playing else { return }
        playTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: Self.frameInterval)
                guard let self, !self.frames.isEmpty else { continue }
                self.index = (self.index + 1) % self.frames.count
            }
        }
    }
}

// MARK: - View

/// Animated precipitation radar overlaid on the same MapTiler `outdoor-v2`
/// basemap as the rest of the app. Pan/zoom is allowed within zoom 3–7 (radar
/// tiles carry no data above 7). When offline, the last cached frame list is
/// reused and tiles are served from MapLibre's on-disk cache.
struct RadarMapView: View {
    let lat: Double
    let lon: Double

    @State private var model = RadarMapViewModel()
    @State private var camera: MapViewCamera

    private static let radarSource = "rainviewer"
    private static let radarLayer = "rainviewer-layer"
    private static let markerLayer = "radar-pos-dot"

    init(lat: Double, lon: Double) {
        self.lat = lat
        self.lon = lon
        _camera = State(initialValue: .center(
            CLLocationCoordinate2D(latitude: lat, longitude: lon),
            zoom: 6
        ))
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            ZStack(alignment: .topLeading) {
                mapContent
                timestampBadge
                if !model.frames.isEmpty { controlBar }
            }
            .frame(height: 280)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).stroke(.quaternary) }

            // Required RainViewer attribution + basemap credit, below the map.
            Text("Rain Viewer · © MapTiler © OpenStreetMap")
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
        }
        .onAppear { model.start() }
        .onDisappear { model.stop() }
    }

    @ViewBuilder
    private var mapContent: some View {
        if let styleURL = MapConfig.styleURL {
            MapView(styleURL: styleURL, camera: $camera) {
                // Current-position marker — a soft halo under a solid dot.
                let point = CLLocationCoordinate2D(latitude: lat, longitude: lon)
                let source = ShapeSource(identifier: "radar-pos") {
                    MLNPointFeature(coordinate: point)
                }
                CircleStyleLayer(identifier: "radar-pos-halo", source: source)
                    .radius(12)
                    .color(.white)
                    .circleOpacity(0.5)
                CircleStyleLayer(identifier: Self.markerLayer, source: source)
                    .radius(6)
                    .color(UIColor(red: 0.15, green: 0.39, blue: 0.92, alpha: 1))
                    .strokeWidth(2)
                    .strokeColor(.white)
            }
            .unsafeMapViewControllerModifier { controller in
                let mapView = controller.mapView
                mapView.minimumZoomLevel = 3
                mapView.maximumZoomLevel = Double(RainViewerClient.maxZoom)
                applyRadarFrame(to: mapView)
            }
        } else {
            ZStack {
                Color(.secondarySystemBackground)
                Text("Radar není dostupný")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// Swap the raster source/layer to the current frame, inserting it *below*
    /// the position marker so the dot stays visible through the 0.7-opacity
    /// radar. Re-runs on every render — the auto-play tick drives it.
    private func applyRadarFrame(to mapView: MLNMapView) {
        guard let style = mapView.style, let frame = model.currentFrame else { return }

        if let old = style.layer(withIdentifier: Self.radarLayer) { style.removeLayer(old) }
        if let oldSource = style.source(withIdentifier: Self.radarSource) { style.removeSource(oldSource) }

        let source = MLNRasterTileSource(
            identifier: Self.radarSource,
            tileURLTemplates: [RainViewerClient.tileURL(path: frame.path)],
            options: [
                .minimumZoomLevel: 0,
                .maximumZoomLevel: RainViewerClient.maxZoom,
                .tileSize: 512,
            ]
        )
        style.addSource(source)

        let layer = MLNRasterStyleLayer(identifier: Self.radarLayer, source: source)
        layer.rasterOpacity = NSExpression(forConstantValue: 0.7)
        if let marker = style.layer(withIdentifier: Self.markerLayer) {
            style.insertLayer(layer, below: marker)
        } else {
            style.addLayer(layer)
        }
    }

    private var timestampBadge: some View {
        Text(model.failed ? "Radar není dostupný" : "Radar · \(frameTime)")
            .font(.caption).fontWeight(.medium)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
            .padding(8)
            .allowsHitTesting(false)
    }

    private var controlBar: some View {
        HStack(spacing: 8) {
            Button {
                model.togglePlaying()
            } label: {
                Image(systemName: model.playing ? "pause.fill" : "play.fill")
                    .frame(width: 28, height: 28)
            }
            .accessibilityLabel(model.playing ? "Pozastavit radar" : "Spustit radar")

            Slider(
                value: Binding(
                    get: { Double(model.index) },
                    set: { model.scrub(to: Int($0.rounded())) }
                ),
                in: 0 ... Double(max(model.frames.count - 1, 1))
            )
            .accessibilityLabel("Snímek radaru")
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(8)
        .frame(maxHeight: .infinity, alignment: .bottom)
    }

    private var frameTime: String {
        guard let frame = model.currentFrame else { return "—" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "cs_CZ")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: frame.date)
    }
}
