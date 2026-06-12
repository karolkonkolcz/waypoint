import SwiftUI

struct WatchTodayView: View {
    let snapshot: WatchTodaySnapshot?
    var overview: WatchTrailOverview? = nil
    @State private var page = 1

    /// Crown scrub readout lifted out of the chart so it can take the place of
    /// the "Profil" header title instead of covering the curve. nil until the
    /// crown is first turned.
    @State private var profileReadout: String?

    /// Live GPS, streamed while the profile page is visible.
    @State private var location = CurrentLocationProvider()

    private static let onRouteThresholdKm = 0.25

    /// Hiker's position projected onto today's route in km from start.
    private func currentKm(for snapshot: WatchTodaySnapshot) -> Double? {
        guard let coord = location.coordinate,
              let polyline = snapshot.routePolyline, polyline.count >= 2
        else { return nil }
        let line = LineString(coordinates: polyline)
        guard let proj = nearestPointOnRoute(line, to: coord),
              proj.offRouteKm <= Self.onRouteThresholdKm
        else { return nil }
        return proj.km
    }

    private func interpolatedWatchElevation(_ pts: [WatchRouteProfilePoint], at km: Double) -> Int {
        guard let first = pts.first, let last = pts.last else { return 0 }
        if km <= first.distanceKm { return first.elevationM }
        if km >= last.distanceKm { return last.elevationM }
        for i in 1..<pts.count {
            let a = pts[i - 1], b = pts[i]
            if km <= b.distanceKm {
                let span = b.distanceKm - a.distanceKm
                let t = span <= 0 ? 0 : (km - a.distanceKm) / span
                return Int((Double(a.elevationM) + t * Double(b.elevationM - a.elevationM)).rounded())
            }
        }
        return last.elevationM
    }

    var body: some View {
        NavigationStack {
            Group {
                if let snapshot {
                    if snapshot.isAvailable {
                        TabView(selection: $page) {
                            profile(snapshot)
                                .tag(0)
                            ScrollView { available(snapshot) }
                                .tag(1)
                            timeline(snapshot)
                                .tag(2)
                        }
                        .tabViewStyle(.page(indexDisplayMode: .automatic))
                    } else {
                        ScrollView { unavailable(snapshot) }
                    }
                } else {
                    ScrollView {
                        unavailable(.unavailable(
                            title: "Waypoint",
                            subtitle: "Otevři iPhone appku pro první synchronizaci."
                        ))
                    }
                }
            }
            .navigationTitle("Dnes")
            .toolbar {
                if let day = snapshot?.dayNumber {
                    ToolbarItem(placement: .topBarLeading) {
                        Text("D\(day)")
                            .font(.caption2.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(.black)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.orange, in: Capsule())
                            .accessibilityLabel("Den \(day)")
                    }
                }
            }
        }
    }

    private func available(_ snapshot: WatchTodaySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 7) {
                waypointMark(size: 20)
                VStack(alignment: .leading, spacing: 2) {
                    Text(snapshot.title)
                        .font(.headline)
                        .lineLimit(3)

                    if let trailName = snapshot.trailName {
                        Text(trailName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
            }

            stats(snapshot)

            if let weather = weatherLine(snapshot) {
                section(systemImage: "cloud.sun", title: "Počasí", value: weather)
            }

            if let summary = snapshot.summary {
                Text(summary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(5)
            }

            if snapshot.openTodoCount > 0 {
                VStack(alignment: .leading, spacing: 5) {
                    Label("\(snapshot.openTodoCount) úkolů", systemImage: "checklist")
                        .font(.caption.weight(.semibold))
                    ForEach(snapshot.todoTitles, id: \.self) { title in
                        Text(title)
                            .font(.caption2)
                            .lineLimit(2)
                    }
                }
            }

            if let overview, overview.stages.count > 1 {
                NavigationLink {
                    WatchStageListView(overview: overview)
                } label: {
                    Label("Všechny etapy (\(overview.stages.count))", systemImage: "list.bullet")
                        .font(.caption.weight(.semibold))
                }
                .padding(.top, 2)
            }
        }
        .padding(.horizontal, 2)
    }

    private func unavailable(_ snapshot: WatchTodaySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            waypointMark(size: 26)
            Text(snapshot.title)
                .font(.headline)
            Text(snapshot.subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 2)
    }

    private func profile(_ snapshot: WatchTodaySnapshot) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                profilePageHeader(snapshot)

                let points = snapshot.routeProfile ?? []
                if points.count >= 2 {
                    RouteProfileChart(
                        points: points,
                        readout: $profileReadout,
                        currentKm: currentKm(for: snapshot)
                    )
                    .frame(height: 92)
                    .onAppear { location.start() }
                    .onDisappear { location.stop() }

                    let precip = snapshot.routePrecip ?? []
                    if precip.contains(where: { $0.precipMm > 0 }) {
                        WatchPrecipStrip(
                            points: precip,
                            band: snapshot.rainBand,
                            maxKm: points.last?.distanceKm ?? 0
                        )
                    }

                    HStack(spacing: 6) {
                        metric("Start", value: points.first.map { "\($0.elevationM)m" })
                        metric("Cíl", value: points.last.map { "\($0.elevationM)m" })
                    }
                    HStack(spacing: 6) {
                        metric("Max", value: points.map(\.elevationM).max().map { "\($0)m" })
                        metric("Délka", value: snapshot.distanceKm.map { String(format: "%.1f km", $0) })
                    }
                } else {
                    emptyPage("Profil zatím není uložený.")
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func timeline(_ snapshot: WatchTodaySnapshot) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 9) {
                pageHeader("Kdy a kde", systemImage: "clock")

                let items = snapshot.timelineItems ?? []
                if items.isEmpty {
                    emptyPage("Timeline se ukáže po uložení profilu trasy.")
                } else {
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        HStack(alignment: .top, spacing: 8) {
                            VStack(spacing: 0) {
                                Circle()
                                    .fill(item.isWeather ? Color.orange : Color.secondary)
                                    .frame(width: 6, height: 6)
                                if index < items.count - 1 {
                                    Rectangle()
                                        .fill(Color.secondary.opacity(0.3))
                                        .frame(width: 1.5)
                                        .frame(maxHeight: .infinity)
                                }
                            }
                            .padding(.top, 4)

                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(formatClock(item.hour))
                                        .font(.caption.monospacedDigit().weight(.semibold))
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.85)
                                    Text(item.title)
                                        .font(.caption.weight(.semibold))
                                        .lineLimit(2)
                                }
                                Text(timelineDetail(item))
                                    .font(.caption2)
                                    .foregroundStyle(item.isWeather ? .orange : .secondary)
                                    .lineLimit(2)
                            }
                            .padding(.bottom, index < items.count - 1 ? 8 : 0)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }

    @ViewBuilder
    private func profilePageHeader(_ snapshot: WatchTodaySnapshot) -> some View {
        HStack(spacing: 7) {
            Button {
                page = 1
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)

            if let scrub = profileReadout {
                Text(scrub)
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.black)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(.orange, in: Capsule())
                    .transition(.opacity)
            } else if let km = currentKm(for: snapshot),
                      let pts = snapshot.routeProfile, pts.count >= 2 {
                Label(
                    String(format: "%.1f km · %d m", km, interpolatedWatchElevation(pts, at: km)),
                    systemImage: "location.fill"
                )
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .foregroundStyle(.green)
                .transition(.opacity)
            } else {
                Label("Profil", systemImage: "chart.xyaxis.line")
                    .font(.headline)
                    .labelStyle(.titleAndIcon)
            }
        }
    }

    private func pageHeader(_ title: String, systemImage: String) -> some View {
        HStack(spacing: 7) {
            waypointMark(size: 16)
            Label(title, systemImage: systemImage)
                .font(.headline)
                .labelStyle(.titleAndIcon)
        }
    }

    private func emptyPage(_ message: String) -> some View {
        Text(message)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 12)
    }

    private func stats(_ snapshot: WatchTodaySnapshot) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                metric("km", value: snapshot.distanceKm.map { String(format: "%.1f", $0) })
                metric("ETA", value: snapshot.etaMinutes.map(formatMinutes))
            }
            HStack(spacing: 6) {
                metric("+m", value: snapshot.ascentM.map { String(format: "%.0f", $0) })
                metric("Obtížnost", value: snapshot.difficultyLabel, tint: difficultyColor(snapshot.difficultyLabel))
            }
        }
    }

    private func difficultyColor(_ label: String?) -> Color {
        switch label {
        case "Snadné": return .green
        case "Střední": return .yellow
        case "Těžké": return .orange
        case "Extrémní": return .red
        default: return .primary
        }
    }

    private func metric(_ label: String, value: String?, tint: Color = .primary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value ?? "-")
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(7)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
    }

    private func section(systemImage: String, title: String, value: String) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.caption)
                    .lineLimit(2)
            }
        } icon: {
            Image(systemName: systemImage)
        }
    }

    private func weatherLine(_ snapshot: WatchTodaySnapshot) -> String? {
        var parts: [String] = []
        if let condition = snapshot.weatherCondition {
            parts.append(condition)
        }
        if let temperatureC = snapshot.temperatureC {
            parts.append("\(temperatureC) °C")
        }
        if let precipTotalMm = snapshot.precipTotalMm {
            parts.append(String(format: "%.1f mm", precipTotalMm))
        }
        if let rainStartsHour = snapshot.rainStartsHour {
            parts.append("déšť \(String(format: "%02d:00", rainStartsHour))")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func formatMinutes(_ minutes: Int) -> String {
        let hours = minutes / 60
        let remainder = minutes % 60
        if hours == 0 { return "\(remainder)m" }
        if remainder == 0 { return "\(hours)h" }
        return "\(hours)h \(remainder)m"
    }

    private func waypointMark(size: CGFloat) -> some View {
        Image("WaypointMark")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }

    private func formatClock(_ hour: Double) -> String {
        var whole = Int(floor(hour))
        var minutes = Int(((hour - Double(whole)) * 60).rounded())
        if minutes >= 60 {
            whole += 1
            minutes -= 60
        }
        return String(format: "%02d:%02d", whole % 24, minutes)
    }

    private func timelineDetail(_ item: WatchRouteTimelineItem) -> String {
        var parts = [String(format: "%.1f km", item.distanceKm)]
        if let elevationM = item.elevationM {
            parts.append("\(elevationM)m")
        }
        if let detail = item.detail, !detail.isEmpty {
            parts.append(detail)
        }
        return parts.joined(separator: " · ")
    }
}

/// The "Profil trasy" elevation chart, watch edition. The curve is Catmull-Rom
/// smoothed to match the iPhone chart. Rotating the Digital Crown scrubs an
/// orange cursor along the route, reading out distance + elevation — the watch
/// stand-in for the phone's finger-drag. Rain lives in a separate strip below
/// (`WatchPrecipStrip`), keeping the profile clean.
struct RouteProfileChart: View {
    let points: [WatchRouteProfilePoint]

    /// Distance + elevation readout, surfaced in the page header instead of over
    /// the curve. nil until the crown is first turned.
    @Binding var readout: String?

    /// Hiker's live GPS position projected onto the route in km. nil when
    /// location is unavailable or the hiker is off-route.
    var currentKm: Double? = nil

    /// Cursor position in km. nil until the crown is first turned.
    @State private var scrubKm: Double?
    @State private var crownValue: Double = 0
    @FocusState private var focused: Bool

    private var maxKm: Double { points.last?.distanceKm ?? 0 }
    private var minElevation: Int { points.map(\.elevationM).min() ?? 0 }
    private var maxElevation: Int { points.map(\.elevationM).max() ?? minElevation }

    private var scrubElevation: Int? {
        guard let scrubKm else { return nil }
        return interpolatedElevation(at: scrubKm)
    }

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let distance = max(maxKm, 0.001)

            ZStack(alignment: .topTrailing) {
                profileArea(size: size, distance: distance)
                    .fill(
                        LinearGradient(
                            colors: [.orange.opacity(0.30), .orange.opacity(0.04)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                profileLine(size: size, distance: distance)
                    .stroke(.orange, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))

                endpointDots(size: size, distance: distance)

                if let currentKm, let ele = interpolatedElevation(at: currentKm) {
                    marker(atKm: currentKm, size: size, distance: distance, color: .green.opacity(0.8))
                    positionDot(km: currentKm, elevation: ele, size: size, distance: distance)
                }

                if let scrubKm, let ele = scrubElevation {
                    marker(atKm: scrubKm, size: size, distance: distance, color: .orange)
                    scrubDot(km: scrubKm, elevation: ele, size: size, distance: distance)
                }

                crownHint
            }
        }
        .focusable(points.count >= 2)
        .focused($focused)
        .digitalCrownRotation(
            $crownValue,
            from: 0,
            through: max(maxKm, 0.001),
            by: max(maxKm, 0.001) / 100,
            sensitivity: .medium,
            isContinuous: false,
            isHapticFeedbackEnabled: true
        )
        .onChange(of: crownValue) { _, value in
            let km = min(max(value, 0), maxKm)
            scrubKm = km
            if let ele = interpolatedElevation(at: km) {
                readout = String(format: "%.1f km · %d m", km, ele)
            }
        }
        .onAppear { focused = true }
    }

    // MARK: Crown hint

    /// A faint "turn the crown" cue shown until the first scrub. The live
    /// readout itself now lives in the page header (see `WatchTodayView`).
    @ViewBuilder private var crownHint: some View {
        if scrubKm == nil, points.count >= 2 {
            Image(systemName: "digitalcrown.horizontal.press.fill")
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
                .padding(2)
        }
    }

    // MARK: Geometry

    private func x(forKm km: Double, size: CGSize, distance: Double) -> CGFloat {
        distance <= 0 ? 0 : CGFloat(km / distance) * size.width
    }

    private func y(forElevation elevation: Int, size: CGSize) -> CGFloat {
        let span = max(1, maxElevation - minElevation)
        let ratio = Double(elevation - minElevation) / Double(span)
        return size.height - CGFloat(ratio) * size.height
    }

    private func chartPoint(_ point: WatchRouteProfilePoint, size: CGSize, distance: Double) -> CGPoint {
        CGPoint(x: x(forKm: point.distanceKm, size: size, distance: distance),
                y: y(forElevation: point.elevationM, size: size))
    }

    private func profileLine(size: CGSize, distance: Double) -> Path {
        smoothPath(through: points.map { chartPoint($0, size: size, distance: distance) })
    }

    private func profileArea(size: CGSize, distance: Double) -> Path {
        var path = profileLine(size: size, distance: distance)
        path.addLine(to: CGPoint(x: size.width, y: size.height))
        path.addLine(to: CGPoint(x: 0, y: size.height))
        path.closeSubpath()
        return path
    }

    private func marker(atKm km: Double, size: CGSize, distance: Double, color: Color) -> some View {
        Rectangle()
            .fill(color.opacity(0.9))
            .frame(width: 1.5, height: size.height)
            .position(x: x(forKm: km, size: size, distance: distance), y: size.height / 2)
    }

    private func scrubDot(km: Double, elevation: Int, size: CGSize, distance: Double) -> some View {
        Circle()
            .fill(.orange)
            .frame(width: 8, height: 8)
            .position(x: x(forKm: km, size: size, distance: distance),
                      y: y(forElevation: elevation, size: size))
    }

    private func positionDot(km: Double, elevation: Int, size: CGSize, distance: Double) -> some View {
        Circle()
            .fill(.green)
            .frame(width: 9, height: 9)
            .overlay(Circle().stroke(.black.opacity(0.4), lineWidth: 1))
            .position(x: x(forKm: km, size: size, distance: distance),
                      y: y(forElevation: elevation, size: size))
    }

    @ViewBuilder
    private func endpointDots(size: CGSize, distance: Double) -> some View {
        if let first = points.first, let last = points.last {
            let start = chartPoint(first, size: size, distance: distance)
            let end = chartPoint(last, size: size, distance: distance)
            Circle().fill(.orange).frame(width: 5, height: 5).position(start)
            Circle().fill(.orange).frame(width: 5, height: 5).position(end)
        }
    }

    /// Catmull-Rom smoothing (converted to cubic Béziers), matching the iPhone
    /// chart's `.catmullRom` interpolation.
    private func smoothPath(through pts: [CGPoint]) -> Path {
        var path = Path()
        guard let first = pts.first else { return path }
        path.move(to: first)
        guard pts.count > 2 else {
            for p in pts.dropFirst() { path.addLine(to: p) }
            return path
        }
        for i in 0..<pts.count - 1 {
            let p0 = pts[max(i - 1, 0)]
            let p1 = pts[i]
            let p2 = pts[i + 1]
            let p3 = pts[min(i + 2, pts.count - 1)]
            let c1 = CGPoint(x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6)
            let c2 = CGPoint(x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6)
            path.addCurve(to: p2, control1: c1, control2: c2)
        }
        return path
    }

    /// Linear interpolation of elevation at an arbitrary distance.
    private func interpolatedElevation(at km: Double) -> Int? {
        guard let first = points.first, let last = points.last else { return nil }
        if km <= first.distanceKm { return first.elevationM }
        if km >= last.distanceKm { return last.elevationM }
        for i in 1..<points.count {
            let a = points[i - 1], b = points[i]
            if km <= b.distanceKm {
                let span = b.distanceKm - a.distanceKm
                let t = span <= 0 ? 0 : (km - a.distanceKm) / span
                return Int((Double(a.elevationM) + t * Double(b.elevationM - a.elevationM)).rounded())
            }
        }
        return last.elevationM
    }
}

/// "Srážky na trase" — a compact precipitation bar strip shown under the watch
/// profile, sharing its distance axis. Bars run deep blue → cyan at the peak;
/// a caption gives the rain window and where it's heaviest.
struct WatchPrecipStrip: View {
    let points: [WatchRoutePrecipPoint]
    var band: WatchRainBand?
    let maxKm: Double

    private var maxPrecip: Double { max(points.map(\.precipMm).max() ?? 0, 0.1) }
    private let rainLight = Color(red: 100 / 255, green: 210 / 255, blue: 255 / 255)

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("SRÁŽKY NA TRASE")
                .font(.system(size: 9, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(.secondary)

            GeometryReader { proxy in
                let size = proxy.size
                let distance = max(maxKm, 0.001)
                let barWidth = max(size.width / CGFloat(max(points.count, 1)) * 0.7, 1)
                ForEach(Array(points.enumerated()), id: \.offset) { _, point in
                    if point.precipMm > 0 {
                        let height = max(CGFloat(point.precipMm / maxPrecip) * size.height, 1)
                        RoundedRectangle(cornerRadius: 0.5)
                            .fill(barColor(point.precipMm))
                            .frame(width: barWidth, height: height)
                            .position(
                                x: CGFloat(point.km / distance) * size.width,
                                y: size.height - height / 2
                            )
                    }
                }
            }
            .frame(height: 28)

            if let band {
                Text("\(clock(band.startHour))–\(clock(band.endHour)) · vrchol u \(peakLabel(band.peakKm)) km")
                    .font(.system(size: 9, weight: .medium).monospacedDigit())
                    .foregroundStyle(rainLight)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
    }

    private func barColor(_ value: Double) -> Color {
        let t = min(max(value / maxPrecip, 0), 1)
        func lerp(_ a: Double, _ b: Double) -> Double { (a + (b - a) * t) / 255 }
        return Color(red: lerp(25, 100), green: lerp(118, 210), blue: lerp(210, 255))
    }

    private func peakLabel(_ km: Double) -> String {
        String(format: "%.1f", km).replacingOccurrences(of: ".", with: ",")
    }

    private func clock(_ hour: Double) -> String {
        var whole = Int(floor(hour))
        var minutes = Int(((hour - Double(whole)) * 60).rounded())
        if minutes >= 60 { whole += 1; minutes -= 60 }
        return String(format: "%02d:%02d", whole % 24, minutes)
    }
}

#Preview {
    WatchTodayView(snapshot: WatchTodaySnapshot(
        generatedAt: Date(),
        isAvailable: true,
        title: "Rifugio Bonatti -> La Fouly",
        subtitle: "Dobré ráno",
        trailName: "Tour du Mont Blanc",
        stageType: "trek",
        distanceKm: 19.4,
        ascentM: 860,
        descentM: 1040,
        etaMinutes: 385,
        difficultyLabel: "Těžké",
        summary: "Dnes tě čeká těžký den: 19.4 km s poctivým stoupáním 860 m.",
        weatherCondition: "Polojasno",
        temperatureC: 14,
        precipTotalMm: 1.2,
        rainStartsHour: 15,
        openTodoCount: 2,
        todoTitles: ["Doplnit vodu", "Koupit plyn"],
        dayNumber: 2,
        routeProfile: [
            .init(distanceKm: 0, elevationM: 1220),
            .init(distanceKm: 4, elevationM: 1580),
            .init(distanceKm: 8, elevationM: 2010),
            .init(distanceKm: 13, elevationM: 1760),
            .init(distanceKm: 19.4, elevationM: 980)
        ],
        timelineItems: [
            .init(hour: 8, title: "Rifugio Bonatti", detail: "Start", distanceKm: 0, elevationM: 1220, isWeather: false),
            .init(hour: 10.5, title: "Nejvyšší bod", detail: nil, distanceKm: 8, elevationM: 2010, isWeather: false),
            .init(hour: 15, title: "Srážky na trase", detail: "1.2 mm/h", distanceKm: 14.2, elevationM: 1650, isWeather: true),
            .init(hour: 14.4, title: "La Fouly", detail: "Cíl", distanceKm: 19.4, elevationM: 980, isWeather: false)
        ],
        rainBand: WatchRainBand(startKm: 11.5, endKm: 16.2, peakKm: 14.2, startHour: 12.8, endHour: 13.6),
        routePrecip: (0..<24).map {
            let km = Double($0) / 23 * 19.4
            let d = km - 14.2
            return WatchRoutePrecipPoint(km: km, precipMm: max(0, 2.4 * exp(-d * d / 8)))
        }
    ))
}
