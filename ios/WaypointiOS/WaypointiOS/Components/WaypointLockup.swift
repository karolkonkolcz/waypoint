import SwiftUI

/// Waypoint brand lockup — the orange pin mark + "WAYPOINT" wordmark.
/// Mirrors the PWA `WaypointLockup` (web/public/brand/waypoint-lockup.svg):
/// mark is the vector asset, the wordmark is native Text so it stays crisp and
/// adapts to light/dark. Recolor only by the asset fills; never the white hole.
struct WaypointLockup: View {
    /// Mark height in points; the wordmark scales relative to it.
    var size: CGFloat = 22

    var body: some View {
        HStack(spacing: size * 0.34) {
            Image("WaypointMark")
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
            Text("WAYPOINT")
                .font(.system(size: size * 0.82, weight: .black))
                .tracking(-0.5)
                .foregroundStyle(.primary)
        }
        .accessibilityElement()
        .accessibilityLabel("Waypoint")
    }
}
