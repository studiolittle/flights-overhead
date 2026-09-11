"use client";

import { useEffect, useRef, useState } from "react";
import {
  AirplaneLanding,
  AirplaneTakeoff,
  ArrowRight,
  BeerStein,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { PHASE_LABEL } from "@/lib/classify";
import { categoryLabel, flightTitle, squawkInfo } from "@/lib/aircraft";
import { compass16, flightLevel, msToFpm, msToKt } from "@/lib/format";
import type { Contact } from "@/lib/types";
import { AircraftFacts } from "./AircraftFacts";

/** Which side of the board this is. */
export type BoardSlot = "arriving" | "departing";

/**
 * Arrivals and departures each get their own colour: a solid banner, and the
 * whole card takes on a tint of it.
 */
const SLOT_STYLE: Record<BoardSlot, { ink: string; bg: string; fg: string }> = {
  arriving: {
    ink: "var(--color-accent-ink)",
    bg: "var(--color-accent)",
    fg: "var(--color-on-accent)",
  },
  departing: {
    ink: "var(--color-depart)",
    bg: "var(--color-depart)",
    fg: "var(--color-on-depart)",
  },
};

/** Takes its colour from the surrounding text. */
function SlotIcon({ slot, size }: { slot: BoardSlot; size: number }) {
  const props = { size, weight: "bold" as const };
  return slot === "arriving" ? (
    <AirplaneLanding {...props} />
  ) : (
    <AirplaneTakeoff {...props} />
  );
}

function AircraftPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-[52px] w-[84px] border border-line object-cover"
    />
  );
}

/**
 * Time the board spends fading out the old content before the new content
 * swaps in. Must match the `.board-swap` transition duration in
 * globals.css.
 */
const BOARD_SWAP_MS = 200;

/**
 * One side of the board: the flight currently leading arrivals or departures.
 * Compact, for the side column. Fun facts lead; the live numbers stay, but as
 * one quiet line.
 */
export function FlightBoard({
  slot,
  contact,
  overhead,
  pinned,
  onClear,
  emptyText,
}: {
  slot: BoardSlot;
  contact: Contact | null;
  overhead: boolean;
  pinned: boolean;
  onClear: () => void;
  emptyText: string;
}) {
  // What is actually on screen right now. It lags `contact` by one swap
  // cycle when the flight identity changes, so the old content stays put
  // for the leave animation instead of vanishing the instant a new flight
  // takes over the board.
  const [shown, setShown] = useState(contact);
  const [shownOverhead, setShownOverhead] = useState(overhead);
  const [shownPinned, setShownPinned] = useState(pinned);
  const [swap, setSwap] = useState<"idle" | "leaving" | "entering">("idle");
  /** The flight id currently on screen — only this identity change animates. */
  const shownId = useRef<string | null>(contact?.id ?? null);

  useEffect(() => {
    const nextId = contact?.id ?? null;
    if (nextId === shownId.current) {
      // Same flight (or still empty): just refresh the live numbers.
      setShown(contact);
      setShownOverhead(overhead);
      setShownPinned(pinned);
      return;
    }
    // A different flight (or the empty state) is taking over the board:
    // fade the current content out, then swap and fade the new content in.
    setSwap("leaving");
    const timer = setTimeout(() => {
      shownId.current = nextId;
      setShown(contact);
      setShownOverhead(overhead);
      setShownPinned(pinned);
      setSwap("entering");
      // Paint the entering (offset, transparent) state once before flipping
      // to idle, so the browser has something to transition away from.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSwap("idle"));
      });
    }, BOARD_SWAP_MS);
    return () => clearTimeout(timer);
  }, [contact, overhead, pinned]);

  const swapClass =
    swap === "leaving" ? "board-leave" : swap === "entering" ? "board-enter" : "";
  const style = SLOT_STYLE[slot];

  if (!shown) {
    return (
      <div className={`panel board-swap ${swapClass} flex flex-col`}>
        <div
          className="flex items-center gap-2.5 border-b border-line px-4 py-2.5"
          style={{ borderLeft: `4px solid ${style.ink}`, color: style.ink }}
        >
          <SlotIcon slot={slot} size={18} />
          <span className="whitespace-nowrap text-[14px] leading-none tracking-[0.24em]">
            {PHASE_LABEL[slot]}
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 py-5">
          <BeerStein size={22} weight="bold" className="shrink-0 text-accent-ink" />
          <p className="text-[13.5px] leading-relaxed text-ink-faint">
            {emptyText}
          </p>
        </div>
      </div>
    );
  }

  const e = shown.enrichment;
  const squawk = squawkInfo(shown.squawk);
  const category = categoryLabel(shown.category);
  const title = flightTitle(shown);

  const typeLine = [
    e?.manufacturer && e?.type
      ? `${e.manufacturer} ${e.type}`
      : (e?.type ?? e?.icaoType ?? category),
    e?.registration,
  ]
    .filter(Boolean)
    .join(" · ");

  const kt = msToKt(shown.velocityMs);
  const fpm = msToFpm(shown.verticalRateMs);
  const vs = shown.verticalRateMs ?? 0;
  const absFpm = fpm == null ? null : Math.abs(Math.round(fpm)).toLocaleString();

  const numbers = [
    shown.baroAltitudeM != null ? flightLevel(shown.baroAltitudeM) : null,
    kt != null ? `${Math.round(kt)} kt` : null,
    absFpm && vs > 0.5 ? `climbing ${absFpm} fpm` : null,
    absFpm && vs < -0.5 ? `descending ${absFpm} fpm` : null,
    `${shown.distanceKm.toFixed(1)} km ${compass16(shown.bearingDeg)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`panel board-swap ${swapClass} flex flex-col`}
      style={{
        borderColor: style.bg,
        background: `color-mix(in srgb, ${style.bg} 7%, var(--color-surface))`,
      }}
    >
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5"
        style={{ background: style.bg, color: style.fg }}
      >
        <span className={shownOverhead ? "pulse-soft" : undefined}>
          <SlotIcon slot={slot} size={20} />
        </span>
        <span className="whitespace-nowrap text-[15px] font-semibold leading-none tracking-[0.2em]">
          {PHASE_LABEL[slot]}
        </span>

        {shownOverhead && (
          <span
            className="whitespace-nowrap px-2 py-0.5 text-[11.5px] font-semibold tracking-[0.2em]"
            // Inverted on the banner: red on gold is too low-contrast.
            style={{ background: style.fg, color: style.bg }}
          >
            OVERHEAD NOW
          </span>
        )}
        {squawk?.emergency && (
          <span className="whitespace-nowrap border border-alert bg-alert px-2 py-0.5 text-[11.5px] tracking-[0.2em] text-canvas">
            {squawk.label.toUpperCase()}
          </span>
        )}

        <span className="ml-auto flex items-center gap-3">
          <span className="text-[11.5px] tracking-[0.2em] opacity-70">
            {shownPinned ? "PINNED" : "AUTO"}
          </span>
          {shownPinned && (
            <button
              type="button"
              onClick={onClear}
              className="chip flex items-center gap-1.5"
              style={{ borderColor: style.fg, color: style.fg }}
            >
              <X size={11} weight="bold" />
              CLEAR
            </button>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-3.5 p-4">
        {/* Identity */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[20px] leading-[1.15] text-pretty break-words text-ink">
              {title}
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-dim">
              {typeLine || "Aircraft type unavailable"}
            </p>
          </div>
          {e?.photoThumbUrl && (
            <AircraftPhoto
              src={e.photoThumbUrl}
              alt={`${typeLine || "Aircraft"} in flight`}
            />
          )}
        </div>

        {/* Route */}
        {e?.origin || e?.destination ? (
          <div>
            <div className="flex items-center gap-3">
              <Endpoint
                code={e?.origin?.iata ?? e?.origin?.icao}
                city={e?.origin?.municipality ?? e?.origin?.name}
              />
              <ArrowRight
                size={16}
                weight="bold"
                className="shrink-0 text-ink-faint"
              />
              <Endpoint
                code={e?.destination?.iata ?? e?.destination?.icao}
                city={e?.destination?.municipality ?? e?.destination?.name}
              />
            </div>
            {e?.staleRoute && (
              <p className="mt-2 text-[12.5px] leading-snug text-ink-faint">
                The route on file for this flight number ({e.staleRoute}) is
                out of date, so only the Ottawa end is shown.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-faint">
            No route filed for this callsign.
          </p>
        )}

        {/* Fun facts lead: they are what people come for */}
        <AircraftFacts icaoType={e?.icaoType} />

        {/* Live numbers: kept, but quiet. The Learning Centre explains them. */}
        <p className="border-t border-line pt-2.5 text-[12px] leading-relaxed tracking-[0.04em] text-ink-faint">
          <span className="mr-2 text-[11px] tracking-[0.18em]">LIVE</span>
          {numbers}
        </p>
      </div>
    </div>
  );
}

function Endpoint({
  code,
  city,
}: {
  code: string | null | undefined;
  city: string | null | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="text-[17px] leading-none text-ink">{code ?? "???"}</span>
      <span className="truncate text-[12px] text-ink-dim">
        {city ?? "Unknown"}
      </span>
    </div>
  );
}
