"use client";

import { Broadcast, Warning } from "@phosphor-icons/react/dist/ssr";
import { ageLabel } from "@/lib/format";

export function StatusBar({
  source,
  auth,
  snapshotAt,
  count,
  rangeKm,
  home,
  pollMs,
  stale,
  error,
  nowTs,
}: {
  source: string;
  auth: string;
  snapshotAt: number | null;
  count: number;
  rangeKm: number;
  home: { lat: number; lon: number };
  pollMs: number;
  stale: boolean;
  error: string | null;
  nowTs: number;
}) {
  const age = snapshotAt ? ageLabel(nowTs - snapshotAt) : "--";

  return (
    <div className="panel flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 text-[11px] tracking-[0.12em] text-[var(--text-dim)]">
      <span className="flex items-center gap-2 text-[var(--accent)]">
        <Broadcast
          size={14}
          weight="bold"
          className={stale ? "opacity-40" : "live-dot"}
        />
        {source.toUpperCase()} · {auth === "authenticated" ? "LIVE" : "ANON"}
      </span>
      <span>SNAPSHOT {age} AGO</span>
      <span>CONTACTS {String(count).padStart(2, "0")}</span>
      <span>RANGE {Math.round(rangeKm)} KM</span>
      <span>SCAN {Math.round(pollMs / 1000)}s</span>
      <span>
        HOME {home.lat.toFixed(3)}, {home.lon.toFixed(3)}
      </span>

      {stale && (
        <span className="flex items-center gap-1.5 text-[var(--warn)]">
          <Warning size={13} weight="bold" />
          {error ? error.toUpperCase() : "FEED STALE"}
        </span>
      )}
    </div>
  );
}
