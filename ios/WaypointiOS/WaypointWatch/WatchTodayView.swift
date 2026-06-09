import SwiftUI

struct WatchTodayView: View {
    let snapshot: WatchTodaySnapshot?
    var overview: WatchTrailOverview? = nil
    @State private var page = 1

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
                pageHeader("Profil", systemImage: "chart.xyaxis.line")

                let points = snapshot.routeProfile ?? []
                if points.count >= 2 {
                    RouteProfileChart(points: points)
                        .frame(height: 92)

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

struct RouteProfileChart: View {
    let points: [WatchRouteProfilePoint]

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let minElevation = points.map(\.elevationM).min() ?? 0
            let maxElevation = points.map(\.elevationM).max() ?? minElevation
            let distance = points.last?.distanceKm ?? 1

            ZStack(alignment: .bottomLeading) {
                profileArea(size: size, minElevation: minElevation, maxElevation: maxElevation, distance: distance)
                    .fill(
                        LinearGradient(
                            colors: [.orange.opacity(0.30), .orange.opacity(0.04)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                profileLine(size: size, minElevation: minElevation, maxElevation: maxElevation, distance: distance)
                    .stroke(.orange, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
            }
        }
    }

    private func profileLine(
        size: CGSize,
        minElevation: Int,
        maxElevation: Int,
        distance: Double
    ) -> Path {
        Path { path in
            for (index, point) in points.enumerated() {
                let coord = chartPoint(
                    point,
                    size: size,
                    minElevation: minElevation,
                    maxElevation: maxElevation,
                    distance: distance
                )
                if index == 0 { path.move(to: coord) } else { path.addLine(to: coord) }
            }
        }
    }

    private func profileArea(
        size: CGSize,
        minElevation: Int,
        maxElevation: Int,
        distance: Double
    ) -> Path {
        var path = profileLine(
            size: size,
            minElevation: minElevation,
            maxElevation: maxElevation,
            distance: distance
        )
        path.addLine(to: CGPoint(x: size.width, y: size.height))
        path.addLine(to: CGPoint(x: 0, y: size.height))
        path.closeSubpath()
        return path
    }

    private func chartPoint(
        _ point: WatchRouteProfilePoint,
        size: CGSize,
        minElevation: Int,
        maxElevation: Int,
        distance: Double
    ) -> CGPoint {
        let x = distance <= 0 ? 0 : (point.distanceKm / distance) * size.width
        let elevationSpan = max(1, maxElevation - minElevation)
        let yRatio = Double(point.elevationM - minElevation) / Double(elevationSpan)
        let y = size.height - (yRatio * size.height)
        return CGPoint(x: x, y: y)
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
        ]
    ))
}
