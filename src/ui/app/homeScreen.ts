/**
 * Whether to offer the "Add to Home Screen" guide (1.2): on an iPhone or iPad, where Safari has
 * no install prompt of its own, and only while the app is not already opened from the Home
 * Screen. iPadOS reports itself as a Mac; a Mac has no touch points.
 */
export interface DeviceInfo {
  userAgent: string;
  maxTouchPoints: number;
  /** Opened from the Home Screen: display-mode standalone, or Safari's navigator.standalone. */
  standalone: boolean;
}

export function isAppleTouch({ userAgent, maxTouchPoints }: DeviceInfo): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function offerHomeScreen(device: DeviceInfo): boolean {
  return isAppleTouch(device) && !device.standalone;
}

/** The device this page runs on. */
export function thisDevice(): DeviceInfo {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, standalone };
}
