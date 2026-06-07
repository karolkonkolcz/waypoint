/**
 * Waypoint brand logo — recreated from design_handoff_waypoint_logo/README.md.
 *
 * The mark is an orange location pin with a white knockout hole. The app header
 * renders the pin-only crop (viewBox 300 100 200 200); the trailing "trail" swoosh
 * from the full source artwork is intentionally cropped out. Recolor by changing
 * the two fill values only — never recolor the hole (it reads as a knockout).
 */

export function WaypointMark({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="300 100 200 200"
      role="img"
      aria-label="Waypoint"
      className={className}
    >
      <path
        d="M384 116 C424 116 452 146 452 184 C452 226 408 262 384 290 C360 262 316 226 316 184 C316 146 344 116 384 116 Z"
        fill="#F37013"
      />
      <circle cx="384" cy="182" r="26" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * Mark + WAYPOINT wordmark, horizontally centered. Wordmark is live Geist Black
 * text so it stays crisp/editable (no custom letterforms).
 */
export function WaypointLockup({
  markSize = 30,
  className,
}: {
  markSize?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className ?? ''}`}>
      <WaypointMark size={markSize} />
      <span
        className="font-sans text-[17px] font-black text-[#2F373D]"
        style={{ letterSpacing: '-0.04em' }}
      >
        WAYPOINT
      </span>
    </span>
  );
}
