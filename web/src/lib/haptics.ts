/** Kurzes Vibrieren als Bestätigung (Android; iOS-Browser ignorieren das). */
export function tap(ms = 12) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // nicht unterstützt
  }
}
