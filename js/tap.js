export const TAP_MS = 480;
export const TAP_SLOP = 36;

/**
 * A second tap in the same spot toggles shop length style.
 * Returns the tap to remember for the next event.
 */
export function classifyLenTap(prev, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.t)) {
    return { toggle: false, prev: prev || null };
  }
  if (
    prev &&
    point.t >= prev.t &&
    point.t - prev.t <= TAP_MS &&
    Math.hypot(point.x - prev.x, point.y - prev.y) <= TAP_SLOP
  ) {
    return { toggle: true, prev: null };
  }
  return { toggle: false, prev: { t: point.t, x: point.x, y: point.y } };
}
