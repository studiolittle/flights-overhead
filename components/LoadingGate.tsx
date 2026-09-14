"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Broadcast } from "@phosphor-icons/react/dist/ssr";

export function LoadingGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    let fontsReady = false;
    let disposed = false;
    const check = () => {
      const dashboardReady = document.querySelector('[data-dashboard-ready="true"]');
      const skyReady = document.documentElement.dataset.theme === "light" ||
        document.querySelector('.night-sky[data-sky-ready="true"]');
      if (!disposed && fontsReady && dashboardReady && skyReady) setReady(true);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      subtree: true, attributes: true,
      attributeFilter: ["data-dashboard-ready", "data-sky-ready", "data-theme"],
    });
    void document.fonts.ready.then(() => { fontsReady = true; check(); });
    // A slow feed or unavailable WebGL must never trap someone behind the loader.
    const fallback = setTimeout(() => setReady(true), 6000);
    return () => { disposed = true; observer.disconnect(); clearTimeout(fallback); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => setRemoved(true), 300);
    return () => clearTimeout(timeout);
  }, [ready]);

  return (
    <>
      {!removed && (
        <div role="status" aria-live="polite" className={`app-loader ${ready ? "app-loader-ready" : ""}`}>
          <span className="app-loader-icon"><Broadcast size={32} weight="bold" aria-hidden="true" /></span>
          <p className="type-heading text-[length:var(--type-3)]">Flights Overhead</p>
          <p className="text-[length:var(--type-small)] text-ink-dim">Getting the radar ready…</p>
          <span className="app-loader-track" aria-hidden="true" />
        </div>
      )}
      <div inert={!ready} aria-busy={!ready}>{children}</div>
      <noscript><style>{`.app-loader { display: none !important; }`}</style></noscript>
    </>
  );
}
