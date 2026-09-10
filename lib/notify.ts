// Thin wrapper over the Notifications API. Everything degrades quietly when
// notifications are unsupported or denied.

export type NotifyState = "unsupported" | "default" | "granted" | "denied";

export function notifyState(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as NotifyState;
}

/** Must be called from a user gesture or browsers will ignore it. */
export async function requestNotifyPermission(): Promise<NotifyState> {
  if (notifyState() === "unsupported") return "unsupported";
  try {
    return (await Notification.requestPermission()) as NotifyState;
  } catch {
    return "denied";
  }
}

export function fireNotification(title: string, body: string, tag: string) {
  if (notifyState() !== "granted") return;
  try {
    new Notification(title, {
      body,
      tag,
      // Re-showing the same tag should not re-alert.
      renotify: false,
      silent: false,
    } as NotificationOptions);
  } catch {
    // Some browsers require a service worker; failing is acceptable here.
  }
}
