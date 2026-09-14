"use client";

import { useEffect, useId, useRef, useState } from "react";
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
      className="h-[52px] w-[84px] rounded-lg border border-line object-cover"
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
 * A flight card, in two versions:
 *
 * - "board": Now Arriving / Now Departing. Small and fixed on the flight
 *   nearest the airport: who it is, the route and one line of live numbers.
 *   No photo, no fun facts: those live under the radar.
 * - "picked": the full card for a flight you tapped on the radar, fun
 *   facts included.
 */
export function FlightBoard({
  slot,
  contact,
  overhead,
  emptyText,
  variant = "board",
  onClear,
}: {
  slot: BoardSlot;
  contact: Contact | null;
  overhead: boolean;
  emptyText: string;
  variant?: "board" | "picked";
  /** picked: close the card. */
  onClear?: () => void;
}) {

  // What is actually on screen right now. It lags `contact` by one swap
  // cycle when the flight identity changes, so the old content stays put
  // for the leave animation instead of vanishing the instant a new flight
  // takes over the board.
  const [shown, setShown] = useState(contact);
  const [shownOverhead, setShownOverhead] = useState(overhead);
  const [swap, setSwap] = useState<"idle" | "leaving" | "entering">("idle");
  /** The flight id currently on screen — only this identity change animates. */
  const shownId = useRef<string | null>(contact?.id ?? null);
  /** A board is a section named by its banner (NOW ARRIVING / NOW DEPARTING). */
  const headingId = useId();

  useEffect(() => {
    const nextId = contact?.id ?? null;
    if (nextId === shownId.current) {
      // Same flight (or still empty): just refresh the live numbers.
      setShown(contact);
      setShownOverhead(overhead);
      return;
    }
    // A different flight (or the empty state) is taking over the board:
    // fade the current content out, then swap and fade the new content in.
    setSwap("leaving");
    const timer = setTimeout(() => {
      shownId.current = nextId;
      setShown(contact);
      setShownOverhead(overhead);
      setSwap("entering");
      // Paint the entering (offset, transparent) state once before flipping
      // to idle, so the browser has something to transition away from.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSwap("idle"));
      });
    }, BOARD_SWAP_MS);
    return () => clearTimeout(timer);
  }, [contact, overhead]);

  const swapClass =
    swap === "leaving" ? "board-leave" : swap === "entering" ? "board-enter" : "";
  const style = SLOT_STYLE[slot];
  const picked = variant === "picked";

  if (!shown) {
    return (
      <section
        aria-labelledby={headingId}
        className={`panel board-swap ${swapClass} flex flex-col`}
      >
        <div
          className="flex items-center gap-2.5 rounded-t-2xl border-b border-line px-5 py-4"
          style={{ color: style.ink }}
        >
          <SlotIcon slot={slot} size={18} />
          <h2
            id={headingId}
            className="type-heading whitespace-nowrap text-[length:var(--type-1)]"
          >
            {PHASE_LABEL[slot]}
          </h2>
        </div>
        <div className="flex items-center gap-3 px-5 py-6">
          <BeerStein size={20} weight="bold" className="shrink-0 text-accent-ink" />
          <p className="text-[length:var(--type-small)] leading-relaxed text-ink-faint">
            {emptyText}
          </p>
        </div>
      </section>
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

  // The picked card sits inside the Fun Facts section, so only a board is a
  // section of its own.
  const Root = picked ? "div" : "section";

  return (
    <Root
      aria-labelledby={picked ? undefined : headingId}
      className={`${picked ? "" : "panel "}board-swap ${swapClass} flex flex-col`}
      // The picked card sits inside the Fun Facts section: no panel of its
      // own and no arriving/departing colours, so it never reads as another
      // Now Arriving / Now Departing board.
      style={
        picked
          ? undefined
          : {
              borderColor: "var(--color-line)",
            }
      }
    >
      {!picked && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-2xl border-b border-line px-5 py-4"
          style={{ background: `color-mix(in srgb, ${style.bg} 8%, var(--color-surface))`, color: style.ink }}
        >
          <span className={shownOverhead ? "pulse-soft" : undefined}>
            <SlotIcon slot={slot} size={18} />
          </span>
          <h2
            id={headingId}
            className="whitespace-nowrap text-[length:var(--type-1)] font-semibold leading-none tracking-normal"
          >
            {PHASE_LABEL[slot]}
          </h2>

          {shownOverhead && (
            <span
              className="whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--type-0)] font-semibold tracking-normal"
              // Inverted on the banner: red on gold is too low-contrast.
              style={{ background: style.fg, color: style.bg }}
            >
              OVERHEAD NOW
            </span>
          )}
          {squawk?.emergency && (
            <span className="whitespace-nowrap border border-alert bg-alert px-2 py-0.5 text-[length:var(--type-0)] tracking-normal text-on-alert">
              {squawk.label.toUpperCase()}
            </span>
          )}
        </div>
      )}

      <div className={`flex flex-col px-5 py-5 ${picked ? "gap-3.5" : "gap-3"}`}>
        {/* Identity */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className={`type-heading ${picked ? "text-[length:var(--type-3)]" : "text-[length:var(--type-2)]"} text-pretty break-words text-ink`}
            >
              {title}
            </h3>
            <p className="mt-1 text-[length:var(--type-0)] text-ink-dim">
              {typeLine || "Aircraft type unavailable"}
            </p>
          </div>
          {picked && (
            <div className="flex shrink-0 items-start gap-2.5">
              {e?.photoThumbUrl && (
                <AircraftPhoto
                  src={e.photoThumbUrl}
                  alt={`${typeLine || "Aircraft"} in flight`}
                />
              )}
              {onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  aria-label="Close this flight"
                  className="chip flex items-center px-2"
                >
                  <X size={13} weight="bold" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Picked card: what the board banner would have flagged. */}
        {picked && (shownOverhead || squawk?.emergency) && (
          <div className="flex flex-wrap gap-2">
            {shownOverhead && (
              <span className="flex items-center gap-1.5 whitespace-nowrap border border-alert px-2 py-0.5 text-[length:var(--type-0)] font-semibold tracking-normal text-alert">
                {/* The dot pulses, not the words: pulsing text drops below
                    readable contrast on every beat. */}
                <span
                  aria-hidden="true"
                  className="pulse-soft size-1.5 rounded-full bg-alert"
                />
                OVERHEAD NOW
              </span>
            )}
            {squawk?.emergency && (
              <span className="whitespace-nowrap border border-alert bg-alert px-2 py-0.5 text-[length:var(--type-0)] tracking-normal text-on-alert">
                {squawk.label.toUpperCase()}
              </span>
            )}
          </div>
        )}

        {/* Route */}
        {e?.origin || e?.destination ? (
          <div>
            <div className="flex items-center gap-3">
              <Endpoint
                code={e?.origin?.iata ?? e?.origin?.icao}
                city={e?.origin?.municipality ?? e?.origin?.name}
              />
              <ArrowRight
                size={15}
                weight="bold"
                className="shrink-0 text-ink-faint"
              />
              <Endpoint
                code={e?.destination?.iata ?? e?.destination?.icao}
                city={e?.destination?.municipality ?? e?.destination?.name}
              />
            </div>
            {picked && e?.staleRoute && (
              <p className="mt-2 text-[length:var(--type-0)] leading-snug text-ink-faint">
                The route on file for this flight number ({e.staleRoute}) is
                out of date, so only the Ottawa end is shown.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[length:var(--type-0)] text-ink-faint">
            No route filed for this callsign.
          </p>
        )}

        {picked ? (
          <>
            {/* The fun facts: what people tap a plane for. */}
            <AircraftFacts icaoType={e?.icaoType} />

            {/* Live numbers: kept, but quiet. The Learning Centre explains them. */}
            <p className="border-t border-line pt-2.5 text-[length:var(--type-small)] leading-relaxed tracking-normal text-ink-faint">
              <span className="mr-2 text-[length:var(--type-0)] tracking-normal">LIVE</span>
              {numbers}
            </p>
          </>
        ) : (
          <>
            <p className="text-[length:var(--type-small)] leading-relaxed tracking-normal text-ink-faint">
              <span className="mr-2 text-[length:var(--type-0)] tracking-normal">LIVE</span>
              {numbers}
            </p>
          </>
        )}
      </div>
    </Root>
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
      <span className="text-[length:var(--type-1)] leading-none text-ink">{code ?? "???"}</span>
      <span className="truncate text-[length:var(--type-0)] text-ink-dim">
        {city ?? "Unknown"}
      </span>
    </div>
  );
}
