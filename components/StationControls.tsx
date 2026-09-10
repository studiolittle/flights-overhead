"use client";

import { useState, type FormEvent } from "react";
import { BellRinging, BellSlash, MapPin } from "@phosphor-icons/react/dist/ssr";
import type { NotifyState } from "@/lib/notify";

const RANGE_PRESETS = [5, 10, 25, 50] as const;

export function StationControls({
  query,
  stationLabel,
  rangeKm,
  onSetStation,
  onSetRange,
  resolving,
  error,
  notify,
  onToggleNotify,
}: {
  query: string;
  stationLabel: string | null;
  rangeKm: number;
  onSetStation: (value: string) => void;
  onSetRange: (km: number) => void;
  resolving: boolean;
  error: string | null;
  notify: NotifyState;
  onToggleNotify: () => void;
}) {
  const [value, setValue] = useState(query);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSetStation(trimmed);
  }

  const notifyOn = notify === "granted";
  const notifyDisabled = notify === "unsupported" || notify === "denied";

  return (
    <div className="panel flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-end lg:gap-8">
      {/* Location */}
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <label
          htmlFor="station"
          className="text-[10px] tracking-[0.22em] text-[var(--text-dim)]"
        >
          STATION
        </label>
        <div className="flex items-center gap-2">
          <input
            id="station"
            name="station"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="M5V 3L9"
            autoComplete="postal-code"
            spellCheck={false}
            aria-describedby="station-help"
            className="field w-[9.5rem] uppercase"
          />
          <button type="submit" className="btn" disabled={resolving}>
            {resolving ? "..." : "SET"}
          </button>
        </div>
      </form>

      {/* Range */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] tracking-[0.22em] text-[var(--text-dim)]">
          RANGE
        </span>
        <div className="flex items-center gap-1.5">
          {RANGE_PRESETS.map((km) => (
            <button
              key={km}
              type="button"
              onClick={() => onSetRange(km)}
              aria-pressed={rangeKm === km}
              className={`chip ${rangeKm === km ? "chip-on" : ""}`}
            >
              {km}
            </button>
          ))}
          <span className="ml-1 text-[11px] text-[var(--text-faint)]">KM</span>
        </div>
      </div>

      {/* Alerts */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] tracking-[0.22em] text-[var(--text-dim)]">
          ALERTS
        </span>
        <button
          type="button"
          onClick={onToggleNotify}
          disabled={notifyDisabled}
          aria-pressed={notifyOn}
          className={`chip flex items-center gap-2 ${notifyOn ? "chip-on" : ""}`}
        >
          {notifyOn ? (
            <BellRinging size={13} weight="bold" />
          ) : (
            <BellSlash size={13} weight="bold" />
          )}
          {notify === "unsupported"
            ? "UNSUPPORTED"
            : notify === "denied"
              ? "BLOCKED"
              : notifyOn
                ? "ON"
                : "OFF"}
        </button>
      </div>

      {/* Resolved location / error */}
      <p
        id="station-help"
        className="flex min-h-[18px] items-center gap-1.5 text-[11px] lg:ml-auto lg:pb-1"
      >
        {error ? (
          <span className="text-[var(--warn)]">{error}</span>
        ) : stationLabel ? (
          <>
            <MapPin size={13} weight="bold" className="text-[var(--accent)]" />
            <span className="text-[var(--text-dim)]">{stationLabel}</span>
          </>
        ) : (
          <span className="text-[var(--text-faint)]">
            Postal code, ZIP or place name
          </span>
        )}
      </p>
    </div>
  );
}
