import SwiftUI

/// Highlights that the forecast follows the hiker along the route ("moving
/// weather") rather than describing a single fixed point — start → on trail → end.
/// Shared by the stage detail and the Today dashboard.
struct MovingWeatherBanner: View {
    let startHour: Int
    let arrivalHour: Int
    @State private var isExpanded = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.snappy(duration: 0.18)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack {
                    Label("Počasí podél trasy", systemImage: "figure.walk.motion")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption.weight(.semibold))
                }
                .foregroundStyle(.blue)
            }
            .buttonStyle(.plain)

            if isExpanded {
                HStack(spacing: 4) {
                    phase("Start", detail: formatHour(startHour), icon: "flag")
                    connector
                    phase("Na trase", detail: nil, icon: "point.topleft.down.to.point.bottomright.curvepath")
                    connector
                    phase("Cíl", detail: formatHour(arrivalHour), icon: "flag.checkered")
                }

                Text("Předpověď tě sleduje, jak postupuješ — ne jeden pevný bod.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func phase(_ title: String, detail: String?, icon: String) -> some View {
        VStack(spacing: 2) {
            Image(systemName: icon)
                .font(.callout)
                .foregroundStyle(.blue)
            Text(title)
                .font(.caption.weight(.medium))
            if let detail {
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var connector: some View {
        Image(systemName: "arrow.right")
            .font(.caption2)
            .foregroundStyle(.tertiary)
    }

    private func formatHour(_ hour: Int) -> String {
        let dayHour = hour >= 24 ? hour - 24 : hour
        return String(format: "%02d:00", dayHour)
    }
}
