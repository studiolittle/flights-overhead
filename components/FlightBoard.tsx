"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { categoryLabel, flightTitle, squawkInfo } from "@/lib/aircraft";
import { compass16, flightLevel, msToFpm, msToKt } from "@/lib/format";
import type { Contact } from "@/lib/types";
import { AircraftFacts } from "./AircraftFacts";

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
      className="h-[52px] w-[84px] shrink-0 rounded-lg border border-line object-cover"
    />
  );
}

/**
 * Time the card spends fading out the old flight before the new one swaps
 * in. Must match the `.board-swap` transition duration in globals.css.
 */
const BOARD_SWAP_MS = 200;

/**
 * The spotlight's flight card: who it is, the route, the fun facts about the
 * type, and a quiet line of live numbers.
 */
export function FlightBoard({ contact }: { contact: Contact }) {
  // What is actually on screen right now. It lags `contact` by one swap
  // cycle when the flight changes, so the old flight stays put for the leave
  // animation instead of vanishing the instant a new one takes over.
  const [shown, setShown] = useState(contact);
  const [swap, setSwap] = useState<"idle" | "leaving" | "entering">("idle");
  /** The flight id currently on screen: only this identity change animates. */
  const shownId = useRef(contact.id);

  useEffect(() => {
    if (contact.id === shownId.current) {
      // Same flight: just refresh the live numbers.
      setShown(contact);
      return;
    }
    setSwap("leaving");
    const timer = setTimeout(() => {
      shownId.current = contact.id;
      setShown(contact);
      setSwap("entering");
      // Paint the entering (offset, transparent) state once before flipping
      // to idle, so the browser has something to transition away from.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSwap("idle"));
      });
    }, BOARD_SWAP_MS);
    return () => clearTimeout(timer);
  }, [contact]);

  const swapClass =
    swap === "leaving" ? "board-leave" : swap === "entering" ? "board-enter" : "";

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
    absFpm && vs > 1.5 ? `climbing ${absFpm} fpm` : null,
    absFpm && vs < -1.5 ? `descending ${absFpm} fpm` : null,
    absFpm && Math.abs(vs) <= 1.5 ? "level" : null,
    `${shown.distanceKm.toFixed(1)} km ${compass16(shown.bearingDeg)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`board-swap ${swapClass} flex flex-col gap-3.5 px-5 py-5`}>
      {/* Identity */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="type-heading text-pretty break-words text-[length:var(--type-3)] text-ink">
            {title}
          </h3>
          <p className="mt-1 text-[length:var(--type-0)] text-ink-dim">
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

      {squawk?.emergency && (
        <span className="self-start whitespace-nowrap rounded border border-alert bg-alert px-2 py-0.5 text-[length:var(--type-0)] tracking-normal text-on-alert">
          {squawk.label.toUpperCase()}
        </span>
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
              aria-hidden="true"
              className="shrink-0 text-ink-faint"
            />
            <span className="sr-only">to</span>
            <Endpoint
              code={e?.destination?.iata ?? e?.destination?.icao}
              city={e?.destination?.municipality ?? e?.destination?.name}
            />
          </div>
          {e?.staleRoute && (
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

      {/* The fun facts: what people tap a plane for. */}
      <AircraftFacts icaoType={e?.icaoType} />

      {/* Live numbers: kept, but quiet. The Learning Centre explains them. */}
      <p className="border-t border-line pt-2.5 text-[length:var(--type-small)] leading-relaxed tabular-nums tracking-normal text-ink-dim">
        <span className="mr-2 text-[length:var(--type-0)] tracking-normal">Live</span>
        {numbers}
      </p>
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
      <span className="text-[length:var(--type-1)] leading-none text-ink">{code ?? "???"}</span>
      <span className="truncate text-[length:var(--type-0)] text-ink-dim">
        {city ?? "Unknown"}
      </span>
    </div>
  );
}
