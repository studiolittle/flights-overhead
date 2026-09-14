"use client";

import { useEffect, useRef, useState } from "react";
import { Users } from "@phosphor-icons/react/dist/ssr";

export function ViewerCount({ active }: { active: boolean }) {
  const session = useRef<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    session.current ??= crypto.randomUUID();
    const id = session.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: AbortController | undefined;

    function leave() {
      clearTimeout(timer);
      pending?.abort();
      setCount(null);
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: id, active: false }),
        keepalive: true,
      }).catch(() => {});
    }

    async function heartbeat() {
      clearTimeout(timer);
      pending?.abort();
      if (stopped || document.visibilityState !== "visible") return;
      const controller = new AbortController();
      pending = controller;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: id, active: true }),
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error("Invalid count");
        if (!stopped && pending === controller && document.visibilityState === "visible") setCount(data.count);
      } catch {
        if (!stopped && pending === controller) setCount(null);
      } finally {
        clearTimeout(timeout);
        if (!stopped && pending === controller && document.visibilityState === "visible") timer = setTimeout(heartbeat, 25_000);
      }
    }

    function visibility() {
      if (document.visibilityState === "visible") void heartbeat();
      else leave();
    }
    void heartbeat();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", visibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", visibility);
      leave();
    };
  }, [active]);

  if (!active) return null;
  return (
    <div className="flex items-center gap-2 text-[length:var(--type-0)] text-ink-dim" title="Active radar sessions, updated every 25 seconds. Inactive sessions expire within 75 seconds.">
      <Users size={16} aria-hidden="true" />
      {count === null ? <span>Viewer count unavailable</span> : <span><span className="font-semibold tabular-nums text-ink">{count}</span> {count === 1 ? "viewer" : "viewers"} watching radar</span>}
    </div>
  );
}
