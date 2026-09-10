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
    <div className="panel flex flex-col gap-4 px-4 py-3.5 lg:flex-row lg:items-start lg:gap-8">
      {/* Location */}
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <label
          htmlFor="station"
          className="text-[11.5px] tracking-[0.22em] text-ink-dim"
        >
          HOME
        </label>
        <div className="flex items-center gap-2">
          <input
            id="station"
            name="station"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="K2G 6P3"
            autoComplete="postal-code"
            spellCheck={false}
            aria-describedby="station-hint"
            className="field w-[9.5rem] uppercase"
          />
          <button type="submit" className="btn" disabled={resolving}>
            {resolving ? "..." : "SET"}
          </button>
        </div>
        <p
          id="station-hint"
          className="max-w-[15rem] text-[12px] leading-snug text-ink-faint"
        >
          Your postal code, ZIP or city. Marks your spot on the radar so it can
          flag a flight passing over you.
        </p>
      </form>

      {/* Range */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11.5px] tracking-[0.22em] text-ink-dim">RANGE</span>
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
          <span className="ml-1 text-[12.5px] text-ink-faint">KM</span>
        </div>
        <p className="max-w-[15rem] text-[12px] leading-snug text-ink-faint">
          How far around the airport the radar reaches. 25 km covers the whole
          approach.
        </p>
      </div>

      {/* Alerts */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11.5px] tracking-[0.22em] text-ink-dim">ALERTS</span>
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
        <p className="max-w-[15rem] text-[12px] leading-snug text-ink-faint">
          {notify === "denied"
            ? "Notifications are blocked in your browser settings."
            : notify === "unsupported"
              ? "This browser cannot show notifications."
              : "A desktop notification when a plane passes overhead."}
        </p>
      </div>

      {/* Resolved location / error */}
      <p className="flex min-h-[18px] items-center gap-1.5 text-[12.5px] lg:ml-auto lg:pt-6">
        {error ? (
          <span className="text-depart">{error}</span>
        ) : stationLabel ? (
          <>
            <MapPin size={13} weight="bold" className="text-accent-ink" />
            <span className="text-ink-dim">{stationLabel}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
