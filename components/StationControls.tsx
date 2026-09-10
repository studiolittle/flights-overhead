"use client";

import { useState, type FormEvent } from "react";
import { BeerStein, MapPin } from "@phosphor-icons/react/dist/ssr";

const RANGE_PRESETS = [5, 10, 25, 50] as const;

export function StationControls({
  query,
  stationLabel,
  rangeKm,
  onSetStation,
  onSetRange,
  resolving,
  error,
  nowTs,
}: {
  query: string;
  stationLabel: string | null;
  rangeKm: number;
  onSetStation: (value: string) => void;
  onSetRange: (km: number) => void;
  resolving: boolean;
  error: string | null;
  /** 0 before mount, so the clock never renders a server guess that would
      mismatch the client's real local time. */
  nowTs: number;
}) {
  const [value, setValue] = useState(query);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSetStation(trimmed);
  }

  return (
    <div className="panel flex flex-col gap-4 px-4 py-3.5">
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
            placeholder="K1V 9B4"
            autoComplete="postal-code"
            spellCheck={false}
            aria-describedby="station-hint"
            className="field w-full uppercase"
          />
          <button type="submit" className="btn" disabled={resolving}>
            {resolving ? "..." : "SET"}
          </button>
        </div>
        <p
          id="station-hint"
          className="text-[12px] leading-snug text-ink-faint"
        >
          Your postal code, ZIP or city. Marks your spot on the radar so it can
          flag a flight passing over you.
        </p>
      </form>

      {/* Range */}
      <div className="flex flex-col gap-1.5 border-t border-line pt-4">
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
        <p className="text-[12px] leading-snug text-ink-faint">
          How far around the airport the radar reaches. 50 km covers the whole
          approach.
        </p>
      </div>

      {/* Local time, date and resolved location / error */}
      <div className="flex flex-col gap-1.5 border-t border-line pt-4">
        <span className="text-[11.5px] tracking-[0.22em] text-ink-dim">
          LOCAL TIME &amp; LOCATION
        </span>
        {nowTs > 0 && (
          <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-dim">
            <span className="status-dot" aria-hidden="true" />
            {new Date(nowTs).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            <span className="text-ink-faint">
              {new Date(nowTs).toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <span className="flex items-center gap-1 text-ink-faint">
              <BeerStein size={13} weight="bold" className="text-accent-ink" />
              It&apos;s 5 o&apos;clock somewhere
            </span>
          </span>
        )}
        <p className="flex min-h-[18px] items-center gap-1.5 text-[12.5px]">
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
    </div>
  );
}
