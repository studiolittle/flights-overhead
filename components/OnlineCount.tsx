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

  // Pinned to the bottom-right corner so it is always on screen. z-[60]
  // clears the page vignette (body::after, z-index 50), which would
  // otherwise dim it.
  return (
    <div
      role="status"
      className="panel fixed z-[60] flex items-center gap-3 px-4 py-2.5 sm:gap-3.5 sm:px-5 sm:py-3"
      style={{
        right: "max(1.25rem, env(safe-area-inset-right))",
        bottom: "max(1.25rem, env(safe-area-inset-bottom))",
        boxShadow: "0 10px 30px rgb(0 0 0 / 0.22)",
      }}
    >
      <span className="status-dot status-dot-lg" aria-hidden="true" />
      <span className="text-[26px] font-semibold leading-none text-ink sm:text-[30px]">
        {online}
      </span>
      <span className="text-[10.5px] leading-[1.25] tracking-[0.2em] text-ink-dim sm:text-[11.5px]">
        {online === 1 ? "USER" : "USERS"}
        <br />
        ONLINE
      </span>
    </div>
  );
}
