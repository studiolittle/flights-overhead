"use client";

import { useEffect, useState } from "react";

/** How often this browser tells the server it still has the app open. */
const HEARTBEAT_MS = 30_000;
const KEY_VISITOR = "fo.visitor";

/**
 * A random id per browser, so several tabs count as one person. It says
 * nothing about the visitor; it is only a stable random string.
 */
function visitorId(): string {
  const make = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : // randomUUID only exists in secure contexts (not plain-http LAN IPs).
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try {
    const existing = window.localStorage.getItem(KEY_VISITOR);
    if (existing) return existing;
    const id = make();
    window.localStorage.setItem(KEY_VISITOR, id);
    return id;
  } catch {
    return make();
  }
}

/** "3 users online", fed by /api/presence. Renders nothing until it knows. */
export function OnlineCount() {
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    const id = visitorId();
    let stopped = false;

    const beat = async () => {
      try {
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { online?: unknown };
        if (!stopped && typeof json.online === "number") setOnline(json.online);
      } catch {
        // Offline or blocked: keep showing the last count.
      }
    };

    // Say goodbye on the way out so the count drops straight away instead of
    // after the server's window expires. sendBeacon survives the unload.
    const leave = () => {
      const payload = new Blob([JSON.stringify({ id, leave: true })], {
        type: "application/json",
      });
      navigator.sendBeacon?.("/api/presence", payload);
    };

    // Back on the tab: refresh now rather than wait out a throttled timer.
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (online == null) return null;

  return (
    <span className="flex items-center gap-2 text-ink-dim">
      <span className="status-dot" aria-hidden="true" />
      {online} {online === 1 ? "user" : "users"} online
    </span>
  );
}
